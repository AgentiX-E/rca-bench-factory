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

## 43 — The typecheck entry point required a build it did not perform

**Defect.** The root `typecheck` script ran two `tsc --noEmit` invocations in
sequence, core then cli. `packages/cli` imports `@rca-bench-factory/core`, which
pnpm links to the core *package root*; resolution therefore goes through core's
`exports` map to `dist/index.d.ts`. Core's `tsconfig` writes to `dist`, so on a
check-out where no build had run that file does not exist.

**Command that demonstrated it.**

```
$ rm -rf packages/core/dist packages/cli/dist
$ pnpm typecheck
src/run.ts(38,8): error TS2307: Cannot find module '@rca-bench-factory/core' ...
src/run.ts(337,16): error TS18046: 'q' is of type 'unknown'.
src/run.ts(441,44): error TS7006: Parameter 'target' implicitly has an 'any' type.
src/run.ts(449,23): error TS7031: Binding element 'target' implicitly has an 'any' type.
src/run.ts(673,70): error TS2366: Function lacks ending return statement ...
Exit status 2
```

**Observed number.** 15 errors, all reported in `cli/src/run.ts`, none of which
named core's missing `dist`.

**Why CI never saw it.** `.github/workflows/ci.yml` orders the steps
`Install → Build → Type-check`. By the time `Type-check` ran, `dist` existed, so
the step was satisfied by the step before it. Every measurement the project had
taken of this script was taken warm.

**The failure mode, stated at the right level.** The messages point at a file the
operator has not modified and describe types that are `unknown` only because the
module they come from failed to resolve. The cause is one step earlier in a
different package. A check whose verdict depends on what a previous command left
on disk is not a check.

**Fix.** A `pretypecheck` hook on the root package that builds core.

```json
"pretypecheck": "pnpm --filter @rca-bench-factory/core build",
```

`pnpm` runs `pre<script>` automatically, so every entry point — the script, a bare
`pnpm run typecheck`, and CI's step — gets the precondition without any caller
having to remember it. The alternative considered and rejected was a `paths`
mapping in `cli/tsconfig.json` pointing at core's `src`: it would type-check cli
against core's source while the build links against core's declarations, which is
two answers to "what is core's public type" and the one that differs is the one
that ships.

**Guard.** `test/typecheck-entrypoint.test.ts` creates a detached git worktree,
applies the working tree's diff into it, installs, removes both `dist` directories,
and runs the real root script, requiring exit 0 and no `error TS` in the output.
The worktree is deliberate: `rm -rf dist` in the developer's own tree would make
the test destructive.

**Injections.**

| Injection | Tests that fail |
| --- | --- |
| `pretypecheck` hook removed from `package.json` | 2 |
| NEGATIVE CONTROL — comment edit in the test file | 0 (stays green) |

**Two corrections inside this finding, both worth recording.**

The first version of the fixture ran the script in a worktree taken from `HEAD`,
which executed the *previous commit's* `package.json`. It reported the injected
precondition missing from a tree that had it. The fix is `git diff HEAD \| git
apply`, and the lesson is that a test which reads history instead of the working
tree inverts its own verdict.

The first full run then reported the suite as failing while the file passed in
isolation: vitest's five-second default timeout is shorter than one `pnpm install`
plus one `pnpm typecheck`. Both assertions now carry an explicit 180-second budget.
A green test that only passes when run alone is a statement about scheduling.

## 44 — Three reachable branch positions the coverage number did not include

**Defect.** `progress.md` reported branches at 99.93%. The measurement was 99.86%.
The gap was not a stale decimal: three branch positions in `parseRcaEvalPath`
(`packages/core/src/score/official.ts`) were reachable by ordinary path strings and
no test took them.

**Command that demonstrated it.**

```
$ pnpm --filter @rca-bench-factory/core test:coverage
All files  |  99.95 |  99.86 |  100 |  99.95 |
 src/cli    |  100   |  99.72 |  100 |  100   | 194
 src/score  |  99.79 |  99.55 |  100 |  99.79 | 1098-1100
```

Reading the raw coverage JSON rather than the summary line named the positions:

```
$ python3 -c "...coverage-final.json..."
== packages/core/src/score/official.ts
  line 454 type=branch counts=[0]   loc 454:26-454:43
  line 456 type=branch counts=[0]   loc 456:61-456:78
  line 1079 type=branch counts=[0]  loc 1079:2-1100:1
```

**Observed number.** 2977 of 2981 branch positions, 99.8656%.

**Two measurement errors made on the way to this, both mine.**

The first was reading `line 454` from the *summary's* uncovered-line column and
concluding the position was inside `if (headMatch === null)`. It is — but I then
concluded the two positions on line 456 were `underscore <= 0` and `underscore ===
labelled.length - 1`, and wrote a test for each, and the coverage did not move to
cover the first. The reason is that `if (A || B)` is compiled to positions per
sub-expression, and `RE2-OB/_cpu/1` satisfies `A`, so `B` is never evaluated and
the row stays at zero *while a test that looks like it covers it passes*. A
disjunction whose left side is true on every input hides its right side from the
instrument.

The second was transcription: the summary column prints the line of the *statement*
the branch belongs to, so `454` and `456` are not the lines I assumed. The
authoritative view is `branchMap` in `coverage-final.json`, which carries
`loc.start.column` and `loc.end.column` per position. Every conclusion in this
finding comes from that view.

**Fix.** Three tests in `test/official.test.ts`, one per position:

| Position | Input | Test |
| --- | --- | --- |
| `headMatch === null` | `RE4-OB/checkoutservice_cpu/1` | rejects a suite the vocabulary does not name |
| `headMatch === null`, no system | `RE2/checkoutservice_cpu/1` | rejects a head segment with no system at all |
| `underscore === labelled.length - 1` | `RE2-OB/cpu_/1` | rejects a labelled segment that ends with the split underscore |
| `underscore <= 0` | `RE2-OB/_cpu/1` | rejects a labelled segment that starts with the split underscore |

**Guard.** The aggregate moved 99.86% → **99.93%**, which is the figure
`progress.md` had been reporting all along. The document was not wrong about the
target; it was wrong about the measurement having been taken.

**Injections.**

| Injection | Tests that fail |
| --- | --- |
| `if (headMatch === null) return undefined;` deleted | 2 |
| the `underscore <= 0` half of the disjunction deleted | 1 |
| the `underscore === labelled.length - 1` half deleted | 1 |
| NEGATIVE CONTROL — comment edit above `parseRcaEvalPath` | 0 (stays green) |

**Retraction of a count, not of a conclusion.** `progress.md` said the residual was
"two statements and two branches". v8 counts a branch *position* — one record per
outcome of a conditional — and the two `never` guards alone account for three, so
the enumeration was a list of *sites* quoted against a figure the tool derives from
*positions*. The revised text gives both and states which is which. No guard was
changed: both remain compile-time backstops, and the argument for keeping them is
the one already recorded in `acceptance.md` §2.39.

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

## 45 — The derive step skipped a path the scoring step then insisted on reading

Found by re-reading the fourth anchor's run history rather than by running
anything. The workflow has been dispatched **eleven** times. Two of those runs
failed, and both failed at the *same* step; three earlier ones were cancelled by
each other and produced nothing. The previous account in `progress.md` said the
failure "has moved down the job three times", which was true of the five runs it
listed and false as a description of the workflow's current state: the failure had
stopped moving and was sitting still in one place.

That distinction is not pedantic. "Failing at different stages" asks for a fault
taxonomy; "failing at one step, repeatedly" asks for a fix. Reading it as the
former is what kept this open.

### What the run actually prints

Steps 8, 9 and 10 of `official-data.yml` all pass:

```
VERIFIED  rcaeval-re2-ob: bytes=1191025569 sha256=0605a36cdcad8a6ae0107f2357c9c91ecee2c4ab5d72579bffea0372d9747513
VERIFIED  rcaeval-re2-ss: bytes=245629018  sha256=7aff9a3a0df7e2febbce4f75f0b7ba332da943aacadbffe6d5113a588ef6e295
VERIFIED  rcaeval-re2-tt: bytes=2801345134 sha256=6706311d2c00d9f5a335f73f6a11f4ad4417522abed7e7ee8c88b8e898088805
REPORT    /tmp/pins.json: 3 pin(s) measured
Fetched 3 asset(s) into /tmp/official
apply-pins: OK (3 pin(s) agree with the report; nothing written)
```

Then step 10, which is the last thing to succeed:

```
warning: skipped RE2-OB/checkoutservice_cpu/multi-source-data: path does not carry the case layout
Wrote /tmp/rcaeval-cases.json
  270 case(s): RE1=0 RE2=270 RE3=0
  1 path(s) skipped; each is named above with its reason
```

And then step 11, which dies on the first case it tries to read:

```
ROUNDTRIP corpus /tmp/official
ROUNDTRIP declared 270 case(s), found 2978 file(s), 364 directory(ies)
Error: ENOENT: no such file or directory, open
    '/tmp/official/RE2-OB/checkoutservice_cpu/1/metrics.json'
    at Object.openSync (node:fs:560:18)
    at readFileSync (node:fs:444:35)
    at adaptCase (.../scripts/check-official.mjs:236:17)
    at .../scripts/check-official.mjs:381:19
  errno: -2,
  code: 'ENOENT',
##[error]Process completed with exit code 1.
```

### What was wrong

Two scripts hold two different opinions about which directories are cases, and
nothing between them says so.

`gen-rcaeval-cases.mjs` requires a case directory to contain `inject_time.txt`, and
when it finds a directory that does not, it records the skip and moves on:

```js
const injectTimePath = join(casePath, 'inject_time.txt');
if (!existsSync(injectTimePath) || !statSync(injectTimePath).isFile()) continue;
```

The skipped path is `RE2-OB/checkoutservice_cpu/multi-source-data`. Its third
component is `multi-source-data`, not a run index, so it is not a case in the
corpus's `{suite}-{system}/{service}_{fault}/{run}` layout — the skip is correct.

`check-official.mjs` does not consult that rule. It takes the descriptor list and
reads one file per descriptor:

```js
function adaptCase(root, entry) {
  const path = join(root, entry.caseId, 'metrics.json');
  const bytes = readFileSync(path);
```

`entry.caseId` here resolves to the **parent** of the skipped directory --
`RE2-OB/checkoutservice_cpu/1`. So the derive step excluded a path and the scoring
step dereferenced it anyway, and the two disagreed by exactly one entry: 270
declared, 271 read.

### Why every in-repo check missed it

The same shape as finding 42, one layer up. `gen-rcaeval-cases.mjs` has a test that
it skips a non-case directory, and `check-official.mjs` has a test that it reads the
`metrics.json` a descriptor names. Both are true. **Neither tests the composition**
— that every skipped path is also a path the reader will not ask for — and no
fixture contains a directory that is deliberately *not* a case, so no fixture can
express the disagreement.

This is the third time in this repository that two components have agreed with
themselves and disagreed with each other: 42 (writer vs reader of the case
directory name), 43 (the coverage number vs its denominator) and now 45 (the
deriver vs the reader of the case set). The pattern is consistent enough to name:
**a component tested only against its own contract certifies its own assumption.**

What made this survive is that step 10 *reported* the skip. A `warning:` line went
into the log on every run, was read as informational, and was in fact the exact
precondition of the crash two seconds later.

```text
warning: skipped RE2-OB/checkoutservice_cpu/multi-source-data: path does not carry the case layout
                                     ^ this path                        ^ and this is why
```

### The fix

Three parts, and the third is the one that generalises.

1. **One rule, one place.** The predicate "is this directory a case" moves out of
   both callers into shared code that both import, so a path can no longer be a
   case for one and not the other.

2. **The reader asks before it opens.** `adaptCase` resolves the descriptor through
   the same predicate and reports a descriptor it cannot resolve as a named
   failure, rather than opening a path it has no reason to believe exists. `ENOENT`
   on a descriptor is a corpus-or-derived-data defect and says so; it is not an
   `openSync` crash.

3. **The count becomes an assertion.** Step 10 currently prints a number and a
   warning and exits 0 either way. It now has to account for every path it walked:
   `declared == skipped + derived`, and every case a descriptor names must resolve
   to a readable `metrics.json`. A mismatch fails the step.

   This is the judgement `progress.md` already states and this finding is the
   second time it has paid off: **a threshold gate prevents regression, an
   enumeration gate discovers omission.** A warning is neither. It is a threshold
   gate with the threshold set to infinity — it cannot fail, so it cannot inform.

### What is still unmeasured

The corpus cannot be fetched from this session (`zenodo.org` does not resolve
here), so this finding is from the runner's log and not from a local reproduction.
The failing step has therefore **not** been re-run with the fix. Until it is, the
honest status of the fourth anchor is *"the failure is identified and the fix is
argued, not verified"* — which is a weaker claim than the fix being in, and is the
claim being made.

The log itself was readable by the route `progress.md` records: the API answers 302
to `productionresultssa11.blob.core.windows.net`, and the signed URL in that
redirect is a plain HTTPS host that a fetch tool can read even though the shell
cannot reach it. The earlier note that this log was unreadable was, once again, a
limitation of one instrument reported as a property of the thing measured.

## 46 — Finding 45 named the wrong mechanism, and the guard it added had no test

Finding 45 is right that the fourth anchor dies on its first case and wrong about
why. It blamed `multi-source-data`: the derive step skips that directory, the
scoring step dereferences it, and the two disagree by one entry. That reading is
consistent with the log and is not what the log says.

The crash line names the path:

```
'/tmp/official/RE2-OB/checkoutservice_cpu/1/metrics.json'
                                  ^ this is a case, not the skipped directory
```

`.../1` is a case. It carries the `{suite}-{system}/{service}_{fault}/{run}` shape
exactly, and `gen-rcaeval-cases.mjs` emitted a descriptor for it, which is how it
reached the reader at all. So the derive step did not skip it, the scoring step
did not dereference something the derive step had excluded, and 270 declared
against 271 read is not what happened. Finding 45's mechanism was a second
invention laid over the first one: finding 45 corrected "the failure has moved
down the job three times" and then repeated the same error one level in.

### What the mechanism actually is

The run artifact settles it. `rcaeval-rcaeval-re2-round-trip.zip` was downloaded
from the workflow run (5502 bytes, via the Azure Blob redirect route finding 45
records) and holds the descriptor the failing step consumed:

```
counts: { RE1: 0, RE2: 270, RE3: 0 }
RE2-OB/checkoutservice_cpu/1  injectTime=2024-01-15T21:36:06.000Z
RE2-OB/checkoutservice_cpu/2  injectTime=2024-01-15T21:37:06.000Z
RE2-OB/checkoutservice_cpu/3  injectTime=2024-01-15T21:38:06.000Z
```

Three cases under `checkoutservice_cpu`, in sequence, with real injection times,
and **zero** cases under `multi-source`. The skip in step 10 is unrelated to the
crash in step 11.

The defect is a name. `check-official.mjs` read every case as `metrics.json`:

```js
const path = join(root, entry.caseId, 'metrics.json');
```

`metrics.json` is the name **our exporter** writes. The corpus does not. Upstream's
own harness locates its cases by globbing `**/data.csv` and reading the labels back
out of the path, which `docs/targets/rcaeval.md` records, and which
`gen-rcaeval-cases.mjs` already relies on when it tests for `inject_time.txt`
rather than for the payload. The reader was asserting a name that only one side of
the exchange had agreed to.

So the descriptor's existence proves `inject_time.txt` exists under
`checkoutservice_cpu/1`, and the crash proves `metrics.json` does not. Both are
true, and only one of them is about the corpus.

This is finding 42 again — writer and reader disagreeing about a name — one layer
down and in the opposite direction. Finding 42 was a reader that invented a name
the corpus did not use; this is the same reader inventing a second one, after
finding 42's fix taught it to stop inventing the first.

### Why the fix in finding 45 did not catch it

Finding 45's part 2 is "the reader asks before it opens", and the reasoning is
sound: `ENOENT` from `openSync` names a syscall rather than a corpus, and an
operator cannot act on it. But the guard it added asked the **wrong question**. It
asked whether the *directory* was a case, a predicate the directory already
satisfied, rather than whether the *payload* it was about to open existed. A guard
on the wrong predicate fails open in exactly the case that was crashing.

The fix is to resolve the payload by name before opening it, and to report a case
that carries none of the known names by listing the names it looked under and the
names it found. Both halves are needed: the error has to say what was missing
*and* what was there, because "the download is truncated" and "the layout moved"
are different findings that call for different responses.

### The guard had no test, and no test could have noticed

This is the part worth writing down. Finding 45's part 3 added an enumeration gate
to `check-official.mjs`: it counts the cases that round-tripped and refuses to print
`ROUNDTRIP PASSED` unless that count equals the number of cases the descriptor
declared. Correct in substance, and **zero tests touched it.**

Removing the gate and running the file left all 27 tests green. Removing the gate
*and* diverting two cases past the count left them green as well. The only way to
show the gate does anything was a controlled experiment kept outside the suite:

| gate | per-case lines | counted | verdict | exit |
|---|---|---|---|---|
| present | `PASS 1/2`, `PASS 2/2` | 0 | `ROUNDTRIP FAILED` | 1 |
| removed | `PASS 1/2`, `PASS 2/2` | 0 | `ROUNDTRIP PASSED (0 case(s) ...)` | **0** |

Identical per-case output, and only the gate distinguishes 0-of-2 from 2-of-2.
Without it the script certifies an empty run as a pass. A defence that does this is
worse than no defence, because it is read as evidence — which is finding 45's own
sentence about warnings and thresholds, now demonstrated against the gate that
finding 45 added to fix it.

**A threshold gate prevents regression, an enumeration gate discovers omission,
and a gate with no test is neither.** The third clause is new and was expensive.

### The fix, and what it cost to verify

`check-official.mjs` now resolves the payload against a named set
(`CASE_PAYLOAD_NAMES`), reports an unresolvable case with the names tried and the
names found, and continues rather than aborting at the first — so a corpus with a
systematically different payload name is enumerated by one dispatch instead of one
dispatch per case. Six tests cover it, including the accepting half (`data.csv` is
read) and a negative control, so a reader that refused everything cannot pass.

Two tests now cover the enumeration gate: that a fully counted corpus is accepted,
and that the declared and counted figures are reported as separate numbers with the
missing case named. Both fail if the gate is removed.

The reproduction is local. The earlier note that this step costs a 90-minute runner
dispatch to observe is no longer true, and the byte-identical stack is:

```
Error: ENOENT: no such file or directory, open
    '/tmp/redcheck/RE2-OB/checkoutservice_cpu/1/metrics.json'
    at readFileSync (node:fs:472:19)
    at adaptCase (.../scripts/check-official.mjs:286:17)
```

— same file, same function, one frame from the CI log's `adaptCase`.

### What is still unmeasured

The fix has not been through the step that failed. It is verified against a
fixture in the official layout, the layout itself is verified against
`docs/targets/rcaeval.md` and the run artifact, and the artifact is the real one.
None of that is the same as step 11 of `official-data.yml` going green on the real
corpus, and the honest status stays *"the failure is identified, reproduced locally,
and the fix is argued and locally verified — not verified in CI"*.

The remaining unknown is whether `data.csv` under `.../1/` holds the metric
samples in a shape `assertRcaevalMetrics` accepts. The descriptor records no
payload name, so this is not derivable from the artifact; it is the first thing the
next dispatch will say.

## 47 — Three gates had no test, and the test written for them was a false green

Finding 46 ended on a rule: *a threshold gate prevents regression, an enumeration
gate discovers omission, and a gate with no test is neither.* This finding is what
happens when that rule is applied to the rest of the repository, and it found more
than expected in two directions.

### What was measured

Every script that can exit 1 is a gate by definition -- it is a process whose only
output is a pass or a refusal. The suite was asked, for each of them, whether
anything makes it fail:

| gate | exit(1) sites | tests referencing it |
|---|---|---|
| `check-no-mock.mjs` | 1 | 1 (by name only) |
| `check-no-secrets.mjs` | 1 | **0** |
| `check-cli-reference.mjs` | 2 | **0** |
| `check-readme-sample.mjs` | 2 | **0** |
| `build-example-bundle.mjs` | 1 | **0** |
| `gen-examples.mjs` | 2 | **0** |
| `verify-example-pack.mjs` | 4 | 1 |
| `check-official.mjs` | 6 | 2 |
| `check-no-vendored-data.mjs` | 1 | 1 |

"Mentioned by name" was not the question that mattered, so it was re-asked as an
experiment. Two probes, both in the real tree:

1. A banned construct was appended to a test file. `check-no-mock.mjs` exited 1 and
   named the file and line -- **and the entire suite stayed green**, so nothing in
   1967 tests would have noticed the gate being removed.
2. The gate was then broken outright (`if (false && ...)`). It printed
   `check-no-mock: OK` on a tree that violates it, and the suite stayed green again.

That is the finding-46 pattern with a larger radius: the gates that guard the
repository's own standards were themselves unguarded, and the failure is silent in
exactly the way that matters -- a hollowed gate and a working gate print the same
line.

### The new file, and the mistake in its first version

`packages/core/test/gates-are-testable.test.ts` asserts the floor: each gate is run
against the repository as it stands (must pass) and against a synthesised violation
in a throwaway copy of the tree (must fail). The copy matters -- a committed
violation would fail `main` and the gate would be deleted rather than fixed.

The first version derived every fixture from the gate's own source. It read as
elegant, and it was self-defeating:

```
### one banned pattern DELETED ###
      Tests  9 passed (9)
```

Deleting `jest.mock` from the gate **deleted that pattern's test along with it**. A
derived list catches *drift* -- a pattern quietly rewritten -- and cannot catch
*deletion*, because the test definition shrinks with the thing it tests. The suite
stayed green while the gate stopped banning something, which is finding 46 exactly,
reproduced inside the file written to prevent it.

The fix is two lists with different jobs: `requiredConstructs` is written
independently and is the deletion guard, while `bannedPatterns` is read from the
gate and is the drift guard. Both are needed; neither alone is sufficient.

### The second mistake: a test that passed for the wrong reason

The `check-cli-reference.mjs` test asserted `status === 1` on a reference with no
command table. It passed. Removing the guard under test **also left it passing**,
because the gate then fell through to `execFileSync` on a CLI the fixture tree does
not contain and crashed on a missing module -- exit 1, same code, different cause:

```
CLI reference check FAILED: no command table found in docs/cli-reference.md
node:internal/modules/cjs/loader:1247
Error: Cannot find module '/tmp/crtree/packages/cli/dist/main.js'
```

A false green is worse than a missing test, because it occupies the place where a
test should be. The assertion now names the reason -- the gate's own diagnostic
present, a module-resolution crash absent -- so a gate that reports nothing and dies
cannot satisfy it.

### The three negatives, after the fixes

Each injection is applied to the real tree and the meta-gate is required to go red:

| injection | result |
|---|---|
| `if (failures.length > 0)` → `if (false && ...)` | **2 red** |
| delete the `jest.mock` pattern from `BANNED` | **3 red**, naming it |
| empty the `BANNED` array | **4 red** |
| hollow `check-no-secrets.mjs` | **2 red** |
| remove `check-cli-reference.mjs`'s no-table guard | **1 red** |

### What this does not cover

The meta-gate is a floor, not a ceiling, and the distinction is worth stating rather
than leaving to be inferred. It proves no gate can be *hollowed out*. It does not
prove every *branch* of every gate is exercised: `check-no-vendored-data.mjs` has
failure paths that need a whole synthetic git repository, and those live in
`check-no-vendored-data.test.ts`, which builds exactly that. Five gates above still
have no test naming them -- `check-readme-sample.mjs`, `build-example-bundle.mjs`,
`gen-examples.mjs`, and the second exits of `check-cli-reference.mjs` and
`gen-rcaeval-cases.mjs`. They are covered by CI running them against the real tree,
which is a weaker claim than a test that forces them to fail, and it is the honest
status.

`progress.md`'s P1-6 tracks the remainder.

---

## 48 — The enumeration gate was written, and it could not see what it enumerated

Finding 47 ended with the claim that an expectation must come from outside the thing
it measures. This finding is that claim failing a third time, in the file written to
enforce it — and then a fourth time after the first fix, which is the part worth
recording in detail.

### What P1-2 asked for

`09-推进进度追踪.md` P1-2: thresholds cannot see omission. Every coverage number in
this repository is 99.9x against a 95% gate, and that number describes the files v8
loaded. A module that *is* reached but whose exported symbols nobody calls reports
full statements, full branches, a satisfied threshold, and a dead export. The fix is
to assert the other direction — every export must be named by something outside its
own tests.

`packages/core/test/export-surface-enumerated.test.ts` does that for the four
directories the plan names: `ir/`, `score/`, `export/`, `gates/`.

### The gate passed. The gate was wrong.

The first version scanned a hand-written list of 17 modules and asserted, per symbol,
that some non-test file names it. Against the real tree it reported:

```
✓ 151 passed
× names at least one symbol per enumerated module
    AssertionError: expected 26 to be greater than or equal to 30
```

Two things in that output matter. The 151 green cases are the substance: **every
export of every enumerated module is already named by a non-test sibling.** That is
a real result about the codebase and it was not assumed — it is measured, and it is
the first time it has been measured.

The single red is my own fault and I am recording it rather than quietly raising the
constant: I wrote `toBeGreaterThanOrEqual(30)` without counting, the real number is
26, and a threshold chosen by feel inside a file whose purpose is to replace feel with
enumeration is a poor advertisement for itself. The assertion now reads `toBe(26)`,
with the reason in place of the number's authority.

### Injection 1 — the module list could not see a new module

The 17 modules were named by hand, and a module outside the list is never scanned.
Appending this to `export/guard.ts`:

```ts
/** INJECTION PROBE - an export no non-test module names. */
export function injectedDeadSymbol(): string { return 'x'; }
```

produced `Tests 153 passed (153)`. Not a failure, not a mention — the injected symbol
was **invisible to the test whose entire purpose is to find symbols nothing names**.

This is finding 47's defect in a new place. There, the expectation shrank with the
thing it measured because it was derived from the gate's own `BANNED` array. Here, the
expectation is a hand-written list, and its blind spot is *additions to the tree*
rather than *deletions from the gate*. Same shape: the measurement is closed under the
operations that matter.

The fix is `UNENUMERATED`, and the direction of the closure is what makes it work.
A glob would have been enough to *see* new modules, but a glob cannot state which
modules are deliberately outside the enumerated four. So every module in `src/` must
appear in exactly one of two places:

- `ENUMERATED_MODULES` — scanned for un-named exports, 17 entries, 137 export names.
- `UNENUMERATED` — not scanned, with a written reason, 28 entries.

Both directions are asserted: a module in neither list is red, and a path in
`ENUMERATED_MODULES` that no longer exists is red. One alone admits a list that has
drifted from the tree.

`UNENUMERATED` also has to be a measurement rather than an escape hatch, or the fix
trades one blind spot for a worse one. Its reasons all say "reached through X", so
those claims are checked: every exempted module except the package entry point must
be imported by some module. An exemption that certified dead code as fine would be a
hole wearing a reason.

That check had its own bug, found by it going red: I matched the importer's text
against `'./llm/openai-compat.js'`, but `file` is package-relative (`src/llm/deepseek.ts`),
so the specifier a sibling actually writes is `'./openai-compat.js'`. The module is
imported twice and the check said zero times. Resolving specifiers properly would mean
reimplementing Node's resolution rules, and a wrong implementation fails open — so the
match is now on the bare specifier, which cannot be wrong about the question being
asked: does this name appear in an import.

### Injection 2 — the module list was fixed, and the same injection still passed

`injectedDeadSymbol` went back in after the module-list fix. The module list now
covered `export/guard.ts`, so the symbol was reachable. The suite reported:

```
Tests 184 passed (184)
```

Because the per-symbol cases were a `const cases = …` at describe scope. `it.each`
materialises that array once, during collection, so the test table was a snapshot of
the exports as they existed when the file was read — and a symbol added afterwards is
not merely unchecked, it is absent from the list of things to check. **The file had
learned to enumerate modules and still enumerated symbols too early.**

The fixture had shrunk, again, and this time the shrink was in time rather than in
content. It is the same defect as finding 47 and the same defect as injection 1, and
it took three attempts in one file to get the lifetime of the expectation right.

The fix moves the resolution inside the assertion body (`exportPairs()`), and — since
this is the third time — adds a test for the property itself rather than trusting it:

```ts
it('every enumeration here is read at run time, not frozen at collection time', () => {
  const before = exportPairs().length;
  const target = join(SRC, 'export', 'guard.ts');
  const original = readFileSync(target, 'utf8');
  try {
    writeFileSync(target, original + `\nexport const runTimeProbe${Date.now()} = 1;\n`);
    expect(exportPairs().length).toBe(before + 1);
  } finally {
    writeFileSync(target, original);
  }
  expect(exportPairs().length).toBe(before);
});
```

It appends to a real file, requires the count to move, and restores the file in a
`finally`. A collection-time constant cannot pass it.

### The injection matrix

Each row is one real execution against the tree.

| injection | before | after |
|---|---|---|
| append an un-named export to a scanned module | `153 passed` | **red, naming `injectedDeadSymbol`** |
| append the same export after only the module-list fix | `184 passed` | **red** |
| create a brand-new module under `src/util/` | — | **red**, `neither enumerated nor explained: util/injected-module.ts` |
| delete a module still listed in `ENUMERATED_MODULES` | — | **red** (`stale entry`) |
| exempt a module that nothing imports | — | **red** (`no module imports it`) |
| three negative controls (tree unchanged) | — | green |

### Result, and what it does not cover

137 export names across the four directories, and **every one of them is named by a
module outside `test/`**. Nothing dead was found; the value delivered here is that the
question is now asked on every run instead of never.

Two honest limits:

- **Symbols, not call sites.** The failure message says "no file outside test/ names
  it", which is what was observed. A symbol reached only through a computed property
  or a dynamic import would be a false positive, and none exists today.
- **Four directories, not the package.** `cli/`, `ingest/`, `transform/`, `pack/`,
  `util/`, `llm/`, `fault/`, `evolution/`, `report/` and `entity/` are exempted with
  reasons. Their reasons point at other mechanisms — the CLI reference gate, the
  structure-dispatch tests, the vocabulary single-source tests — and the importer
  check confirms they are reached. Extending enumeration to them is the remainder of
  P1-2 and is tracked in `progress.md`.

## 49 — Signal validity: a verifier that said yes to everything, and the two defects the coverage pass found under it

P1-1, the only real competitive gap in `06-竞品分析.md` (D-10). Every other benchmark in
the survey scores a submission against ground truth. This one additionally asks the prior
question — given a run's own telemetry, did the fault it claims to have injected actually
happen? A benchmark that scores submissions against unverified injections measures nothing
about the submission.

The deliverable is `packages/core/src/gates/validity.ts`, wired into `checkG3Validity`
behind an opt-in `validity` option so that enabling it is a decision rather than a silent
change to every existing result.

### The three verdicts

`valid` / `invalid` / `unverifiable`, and the third is the one that makes the module
honest. An absence of evidence is not a finding, and a verifier with two verdicts has to
report "we could not check" as "it did not happen" — which is a claim the data cannot
support. Every downstream check reports alongside rather than instead of G3's statistical
half, which is asserted by a coexistence test.

### Defect 1 — the pre-existing-anomaly check could never fire

`no-preexisting-anomaly` asks whether a metric was already anomalous *before* the
injection. The first implementation compared every baseline sample against statistics
computed from all of them, which makes a pre-existing anomaly self-cancelling: ten samples
of 95% followed by ten of 96% have a tiny sigma, so nothing is anomalous and the check
passes. It could not fail. The fixture that exposed it had six normal samples and four
saturated ones, and the check still passed, because the four saturated samples were inside
the very baseline used to judge them.

The repair is a baseline split: the first `minSustainedSamples` samples *establish* normal,
and the remainder is *judged* against it. An anomaly cannot hide inside the statistics that
judge it.

The immediate consequence was a false positive — `stddev([20,21,19])` is exactly 1.0, so
values of 22 and 18 sit at precisely |Z| = 2.000 and were reported as pre-existing. Hence
`preexistingMinAbsZ` (4.0), deliberately above `minAbsZ` (2.0): "was it already broken" is a
stronger claim than "did it move".

### Defect 2 — a two-sample baseline certified every fault it was shown

The comment above the baseline slice read:

> With fewer than that there is nothing to establish a baseline from, and the caller treats
> the case as unverifiable rather than guessing.

**The caller did no such thing.** Nothing enforced it. A bundle with two baseline samples
and a saturated tail was reported `valid`, all six checks green, "first sustained anomaly at
+0s" — because `stddev([20,21])` is 0.707, so a later value of 99 sits at |Z| = 111 and any
injected fault at all clears the threshold. The check was not testing whether the fault
happened; it was testing whether two numbers happened to be close together.

This was found by the coverage pass, not by the suite. Chasing the last unreachable branch
required reading where the baseline is constructed, and the contradiction between the
comment and the code was in the same twelve lines.

### Defect 3 — the fix for defect 2 downgraded a real `invalid`

The first repair keyed the verdict on whether any series matched the expectation. That
conflated two different absences, and two pre-existing tests caught it:

- **no series matched** — a `cpu` fault whose telemetry is entirely latency has *shown*
  that the CPU fault did not manifest. `invalid`.
- **series matched but their baselines were too thin** — nothing is shown either way.
  `unverifiable`.

The second attempt over-corrected in the other direction and reported a case with *no
telemetry at all* as `invalid`, which broke three more tests. The distinction that holds is
drawn on what was **observed** (`target-observed`), not on what matched:

| Situation | Verdict |
|---|---|
| the service emitted no metric series | `unverifiable` |
| it emitted series, none matching the mechanism | `invalid` |
| matching series whose baselines were too thin | `unverifiable` |
| the ground truth names an entity absent from the graph | `invalid` (survives the guard) |

Both wrong versions are recorded because the pair is the finding: the two obvious
conditions are each wrong, in opposite directions, and only the third is right.

### Dead code removed rather than covered

The onset detail carried `` ${onsetOffsetSeconds >= 0 ? '+' : ''} ``, a ternary for a
negative offset. `onsetMs` is drawn only from samples at or after `injectMs`, so an anomaly
starting earlier is in the baseline window and can never be the onset — the offset is
never negative and the branch is unreachable. Two attempts to write a test for it failed
before that was understood. Removed, with a test pinning the invariant that made it dead.

### The leak that presented as thirteen unrelated failures

Running the suite filled the disk to 100%. Thirteen script tests failed — `check-official`,
`check-no-vendored-data`, `apply-pins`, `fetch-official` — none of which touch anything in
this change. The cause was **1422** leftover `/tmp/rca-bench-out-*` directories at 2.1 GB
each: the 2 GiB digest test calls `mkdtempSync` 22 times and nothing ever removed any of
them.

This is worth recording for its shape. A leak that reports as thirteen unrelated defects in
unrelated modules is worse than the leak, because the failure mode invites each failure to
be diagnosed separately. The fix is at the point of creation — a `makeOut()` helper that
registers each directory for removal — rather than a list of directories someone has to
remember to extend.

### Verification

Coverage on `validity.ts` is measured **on the module, not the package**. The package
average is what hid this: the first full run read `99.95 | 99.93 | 100 | 99.95` while
`validity.ts` itself was `93.7 | 89.24 | 100 | 93.7`. Both statement and branch dimensions
were under the 95% floor and the package number did not move.

Final: `validity.ts` at **`100 | 100 | 100 | 100`**.

Falsification matrix — every check made to fail, source restored and diffed clean after
each row:

| injection | result |
|---|---|
| `target-resolves` always passes | **1 failed** |
| `target-observed` always passes | **2 failed** |
| `mechanism-manifested` always passes | **5 failed** |
| `onset-precision` always passes | **2 failed** |
| `sustained-duration` always passes | **2 failed** |
| `no-preexisting-anomaly` always passes | **2 failed** |
| thin-baseline guard forced true | **4 failed** |
| negative control (restored) | 0 (green) |

### What this does not cover

- **The mechanism table is hand-written.** It is a table of what each fault category should
  move, derived from the taxonomy, and nothing derives it from the data. A category whose
  real signature differs from the table would be judged wrongly. It is at least
  totality-checked against `FAULT_CATEGORIES`, so a new category cannot be added silently.
- **It verifies the injection, not the label.** A case whose telemetry genuinely shows a CPU
  fault passes, whether or not the CPU fault was the one intended. Distinguishing two real
  faults from one another is not attempted.
- **Signals other than metrics contribute nothing.** `signalKinds`, `logSeverities` and the
  trace expectations are recorded in the table but only metric series are read, so a
  fault whose only manifestation is an error log is `unverifiable`.

## 50 — The exemption list was the same defect a third time, and the injection matrix found a fourth

P1-2's remainder. The export enumeration covered four directories and exempted the
other ten module by module in `UNENUMERATED`, each with a reason: "reached through
the CLI command table", "reached through the provider registry", "reached through
the pack CLI path".

### What the exemptions were actually worth

Before touching them I probed all 26 non-trivial exempted modules for exports that
no file outside `test/` names. **Zero.** Every export of every exempted module
already had a consumer.

That result is the finding, not a disappointment. The exemptions were not hiding
dead code -- they were hiding the *question*. Each was a reason about one or two
entry points standing in for a scan of every export the module declares, and that
mismatch had never been measured. It is why the promotion is verifiable rather than
hopeful: the export surface is byte-for-byte the same set of names before and after,
so any failure the promotion caused would be a failure of the *mechanism*, not of
the tree.

### The defect: an exemption wider than its argument

`UNENUMERATED` was keyed by **module**. The reason for `cli/args.ts` was about the
CLI command table; the exemption covered the module's entire surface. A symbol added
there next month would have been excused by a sentence written about a different
symbol -- and the sentence would still have read as true, because it was.

This is finding 47 for the third time in one file: the expectation no longer covers
the thing it measures. The first two were a shrinking expectation (derived from the
gate itself) and a frozen one (materialised at collection time). This one is an
expectation whose **scope is wrong**: correct, specific, and attached to something
larger than itself. A defect that has not fired yet reads as a design.

### The repair

- `ENUMERATED_MODULES` now holds all **45** modules. There is no `UNENUMERATED`.
  A module added tomorrow is red until it is listed; exempting a module from
  *scanning* is no longer expressible.
- `EXEMPT_EXPORTS` is keyed `module::symbol`, so the scope of an exemption equals the
  scope of its argument. Only three entries survive, and only two arguments are
  admissible: the symbol erases at runtime, or the package manifest installs it.
- The `llm/provider.ts::*` wildcard is allowed, and constrained by a precondition:
  a wildcard is legal only for a module with no runtime export. Otherwise `*` would
  be the module-wide exemption again, wearing a symbol key.

Measured effect: **18 → 45 modules, 140 → 516 exports** under assertion. Test cases
in this file: 68 → 148.

> **Those are this pass's figures, not the tree's.** At the revision that added finding 54
> the list holds **47 modules and 538 runtime exports**, with **37 exemption entries of
> which two are runtime**. The three numbers above stayed correct for two passes and then
> quietly became three different wrong answers across three documents — which is finding
> 54, and the reason this paragraph now carries a date-scoped qualifier.

### The fourth instance, found by the injection matrix

Row 3 of the matrix grants `index.ts` a wildcard. It stayed **green**.

The precondition read `namedExports(text)` -- `export function`/`const`/`class` --
and `index.ts` is 41 `export { … } from` statements with **zero** named declarations.
The array was empty, so the assertion passed no matter what the module published. An
expectation that cannot see the thing it measures, in the check I had just written to
prevent exactly that.

The repair asks the runtime question instead of the syntactic one: compare the
module's whole declared surface -- named declarations, inline `export { a, b }`, and
`export { x } from './y.js'` -- against its type-only declarations. A module
qualifies for `*` only when every symbol it publishes erases. Re-run, row 3 is red
with `index.ts publishes IR_VERSION, …, renderScore at runtime`, and the legitimate
`llm/provider.ts` wildcard stays green.

The same bug had a mirror image. I first pointed the stale-exemption check at
`namedExports` too, which made `ir/types.ts::SignalKind` red for an export that does
exist -- as a type. Two kinds of exemption are checked against two kinds of
declaration, so the check now unions them and says so in the failure message.

### The injection matrix

Each row is one real execution against the tree; source restored and diffed clean
after every row.

| injection | result |
|---|---|
| a new module under `src/util/` | **2 failed** -- not enumerated |
| an un-named export in a **promoted** module (`transform/strategies.ts`) | **2 failed** -- names `injectedDeadExport` |
| grant `index.ts` a wildcard (it publishes 240 runtime symbols) | **1 failed** -- precondition (was green before the repair) |
| a stale exemption naming a symbol that does not exist | **1 failed** -- `does not declare, at runtime or as a type` |
| a stale module path in `ENUMERATED_MODULES` | **9 failed** |
| delete a real name from `TESTED` | **1 failed** |
| rename `util/hash.ts` so nothing can import it | **10 failed** |
| NEGATIVE CONTROL (tree restored) | 0 (green) |

Rows 2 and 7 are the ones that matter for the P1-2 claim specifically: row 2 shows
the promoted directories are now genuinely scanned rather than argued about, and row
7 shows the importer check that survived the exemptions still holds every module.

### Result

- `validity.ts` and every module in the ten promoted directories: **100 | 100 | 100 | 100**.
- Package: **`99.95 | 99.93 | 100 | 99.95`** across 75 files; the only file below 100%
  is `score/official.ts` at `99.64 | 99.77`, which is a pre-existing and separately
  tracked gap.
- Core tests **`2106 → 2186 passed`**; all 11 gates green; mutation `26`; the official
  anchors byte-stable.

### What this does not cover

- **Symbols, not call sites.** The failure message says "no file outside `test/` names
  it", which is what was observed. A symbol reached only through a computed property
  or a dynamic import would be a false positive; none exists today.
- **The importer check proves a module is reached, not that its exports are called.**
  Those are different properties and neither implies the other. A dead module whose
  symbols appear in a comment and a live module exporting an unused helper are both
  invisible to this file.
- **`index.ts` is checked as a module, not as a surface.** Its 240 re-exported names
  are verified to have consumers at their *sources*; the file re-exporting them is not
  itself asserted to be complete, which is what `pack-manifest-completeness` and the
  package `exports` field cover.

## 51 — Active injection: a planner that is honest about being a planner, and the trap in the DELAY mapping

P1-3. The milestone asks for the five Chaos Mesh fault kinds — CPU, MEM, DISK, DELAY,
LOSS — each verified through the full chain to the official scorer. This finding records
what was built, and, more importantly, what was **not**, because the gap between the two
is the deliverable.

### The boundary, stated first

`packages/core/src/fault/injector.ts` is a **planner and a reader**. It contains no
`fetch`, no `exec`, no `kubectl`, no `child_process`, no filesystem access — a probe over
the source returns two matches and both are inside comments.

```
planInjection()        ->  a Chaos Mesh document        (pure, no I/O)
[cluster applies it -- not this module]
readInjectionStatus()  <-  what the controller reported   (pure, no I/O)
```

That is not a shortcut. A module that shells out to `kubectl` is a module whose tests need
a Kubernetes API server, and **a test that needs a cluster is a test that does not run in
CI**. The deterministic core can own the document and the reading; it cannot own the
apply. What P1-3 delivers is therefore the *half that is testable here*, and the milestone
row stays **partially met** until a cluster run produces five real cases. Claiming
otherwise would be the exact failure this repository's V-01 risk names.

### The trap: DELAY looks like TimeChaos and must not be

Chaos Mesh has a `TimeChaos` whose action reads like a delay. Mapping the DELAY fault onto
it produces a **clock skew**, and the consequence is subtle enough to be worth spelling
out: `gates/validity.ts` verifies a delay fault by reading network latency series, which a
clock skew does not move — so the verifier would ask for a network signal, find none, and
report `invalid`, discarding a case whose injection was never a network delay in the first
place. The fault would be attributed to the system under test.

Both DELAY and LOSS are therefore pinned to `NetworkChaos`, and a test asserts `TimeChaos`
appears nowhere in the manifest for any of the five kinds.

### The other four mappings, and why they are not uniform

| kind | Chaos Mesh kind | action | why not the obvious alternative |
|---|---|---|---|
| `cpu` | `StressChaos` | — | — |
| `memory` | `StressChaos` | — | shares the kind with `cpu`; discriminated by the `stressors` block |
| `disk` | `IOChaos` | `fault` | a disk fault implemented as a memory burn is not a disk fault |
| `delay` | `NetworkChaos` | `delay` | `TimeChaos` is the trap above |
| `loss` | `NetworkChaos` | `loss` | — |

`disk` uses `fault` rather than `latency` because it is the only IOChaos action that makes
I/O **fail** rather than merely slow, and a failure is what a service's error rate and log
severity respond to. A slowdown would be indistinguishable from load in the metrics.

### Three verdicts on the controller's report, for the same reason as everywhere else

`readInjectionStatus` returns `applied: true | false | 'unverifiable'`. The third value is
the point: a controller that did not report is **not** evidence that the fault was not
injected. Collapsing it to `false` would let one broken observability path silently
disqualify every case it touched, which is worse than not checking at all — the same
argument `validity.ts` makes for telemetry, applied one layer upstream.

The phase table is read in both directions. `AllInjected`/`Injected` mean applied.
`AllRecovered`/`Recovered` **also** mean applied: a case whose telemetry window closed
after the fault recovered has proof the fault was on, and reading it as "never injected"
would discard a good case. Only explicitly-named failure phases (`NotInjected`, `Failed`,
`Paused`) produce `false`. An unrecognised phase is `unverifiable` **and names the phase**,
so an upstream rename shows up as a readable message rather than as silence.

### The dead branch, measured rather than covered

The first version derived its `FaultSpec` through `parseFaultSpec` and branched on
`!parsed.ok`. Coverage reported lines 242–243 uncovered and branch at `85.18`.

`parseFaultSpec` has exactly four rejection reasons: input is not an object; the type is
missing or blank; the category is not in the vocabulary; `parameters` is not an object.
An exhaustive probe over the exact call shape — all five kinds × four parameter inputs —
returned `ok: true` every time, because `planInjection` has already validated all four
before the call. **The branch is unreachable.** It was removed and the import narrowed to
type-only, rather than given a test that pretends to exercise it. `spec` is now assembled
directly, and a separate test asserts `inferFaultCategory` agrees with the module's own
category table for all five kinds, so the two cannot drift.

### Branch coverage: nine ternaries that were only ever read one way

Removing the dead branch left `100 | 85.89 | 100 | 100`, and the uncovered positions were
nine ternaries in the manifest builders — the caller-supplied side of every CRD parameter.
Each is a real experiment's parameter: a memory fault with no `size` burns 256Mi, a `loss`
fault with no percentage drops **everything**.

The `loss` default is deliberate and is now commented as such: a fault type named `loss`
whose default dropped 1% of packets would be a fault that does not reliably manifest, and
`validity.ts` would then discard the case for the planner's choice rather than for
anything about the system under test.

One of those nine stayed uncovered even after the block that was written to cover them:
line 332, the `correlation` default of the `loss` block. The test asserted the `loss` key
against a default and the `correlation` key against a supplied value, so **neither side of
that one branch was ever read**. A test that names one key of a two-key object leaves the
other key's default unasserted. Corrected to assert both keys on both sides.

Final: **`100 | 100 | 100 | 100`** on `injector.ts`.

### The injection matrix

Ten rows, each a real execution against the tree; source restored and diffed byte-identical
after every row.

| injection | result |
|---|---|
| DELAY routed through `TimeChaos` (the trap) | **5 failed** |
| DISK becomes a `StressChaos` memory burn | **6 failed** |
| `mode: all` instead of `mode: one` | **1 failed** |
| `unverifiable` collapsed into `false` | **2 failed** |
| recovered injection stops counting as applied | **1 failed** |
| unknown kind coerced instead of refused | **2 failed** |
| blank target accepted | **1 failed** |
| zero/negative duration accepted | **2 failed** |
| window silently defaults instead of refusing | **1 failed** |
| category table drifts from the collector | **1 failed** |
| NEGATIVE CONTROL (tree restored) | 0 (green) |

Two of these are worth naming as behavioural rather than structural. **Row 3**: the CRD
default is `mode: all`, which injects into every pod matching the selector and turns a
single-fault experiment into a multi-fault one, making the ground truth ambiguous —
`mode: one` is pinned and asserted. **Row 7**: a blank target with a selector built from it
would produce a label selector matching nothing, so the experiment would apply cleanly,
report success, and inject into no pod at all. The refusal is what makes that impossible.

### What this does not cover

- **Nothing was applied to a cluster.** The milestone's exit condition — five kinds, each
  with at least one case, through the full chain to the official scorer — is **not met**.
  What is met is that the document for each kind is correct, refusable, and asserted
  against Chaos Mesh's API shape. The remaining work is a cluster runner.
- **The manifest is checked against a hand-written table, not against Chaos Mesh.** The
  mapping was derived from the CRD documentation and is asserted for internal consistency
  and for the `TimeChaos` trap specifically; no test validates it against a live
  `kubectl apply --dry-run=server`. A CRD field renamed upstream would not be caught here.
- **`applied: true` is not the same claim as "the fault manifested".** This module reads
  the controller's opinion. Whether the injected fault changed the system's telemetry is
  the question `gates/validity.ts` answers, and the two are deliberately separate: a
  controller can report `AllInjected` for a fault that the application absorbed without
  visible effect.
- **Only the five kinds are planned.** `pod-kill`, `time-skew`, DNS and partition faults
  are real chaos experiments in the taxonomy's other categories and are refused rather
  than coerced — the refusal is asserted, but it does mean the planner covers a minority
  of what a production campaign would need.

## 52 — The fourth anchor: a retry loop whose scope was narrower than its name

P0-1/P1-4. `official-data.yml` has run **twelve times** since it was added and has
**never once produced a measurement**. This finding is the first half of fixing that: the
root cause of the step-8 failure, the repair, and the injection matrix that shows the
repair is load-bearing. The second half — the measurement itself — is the point of the
workflow and is recorded separately.

### What the log said, and why it was not enough

Every failed run ended the same way: a digest comparison that did not match, then `fail()`,
then the job stops. The obvious reading is "the download was corrupted", and the obvious
fix is to retry. **Both were wrong**, and the reason is visible only in the source.

### The defect

`scripts/fetch-official.mjs` had a retry loop. It read like this:

```js
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  const { code, stderr, elapsedMs } = await download(asset.url, destination);
  if (code === 0) { lastError = ''; break; }
  lastError = `attempt ${attempt}/${MAX_ATTEMPTS} ...`;
  if (attempt < MAX_ATTEMPTS) { await sleep(...); }
}
if (lastError !== '') { return { status: 'skipped', ... }; }

const bytes = statSync(destination).size;      // ← outside the loop
const digest = await sha256Of(destination);    // ← outside the loop
if (asset.bytes !== null && bytes !== asset.bytes) { fail(...); }
if (asset.sha256 !== null && digest !== asset.sha256) { fail(...); }
```

**The loop protects "can we get bytes", never "are the bytes right".** `statSync`,
`sha256Of` and both comparisons sit after the loop, so a transfer that returns HTTP 200
and a truncated body is not a bad *attempt* — it is a bad *result*, and it goes straight to
`fail()`, which under `set -eu` ends the job.

The mechanism had a name that promised retry and a scope that provided one attempt. That is
the shape this audit has now recorded five times: findings 47, 49, 50 and 51 are all
"an expectation whose scope is narrower than the reader would assume", and this is the
same defect at the process level rather than inside a test.

### Why a bigger retry count would not have helped

Because there are two failure classes and they need **opposite** actions:

| class | what it means | retryable? |
|---|---|---|
| the file is **short** | the transfer died mid-flight; the bytes existed and a second attempt can recover them | **yes** |
| the file is the **right length, wrong digest** | the transfer completed; this is a *different file* (upstream substitution, or a mis-transcribed pin) | **no** |

Retrying the second class is not merely useless — it spends the job's budget downloading
the same wrong bytes. And both classes surfaced as the identical string "verification
failed", which is why a year of red runs produced no diagnosis.

### The repair, in two halves

Verification moved **inside** the loop, so a bad transfer is a bad *attempt* and the loop
still has chances left to spend:

```js
  // The transport succeeded, which is not the same as the file being right.
  // Measuring here rather than after the loop is the whole fix.
  const bytes = statSync(destination).size;
  const digest = await sha256Of(destination);
  const problem = classifyVerification(asset, { bytes, digest });
  if (problem === null) { lastError = ''; break; }
  lastError = `attempt ${attempt}/${MAX_ATTEMPTS} ...: ${problem.reason}`;
  pinProblem = problem.pinProblem;
  if (!problem.retryable) { break; }   // retrying cannot turn one file into another
```

and the two classes got separate exit codes, so the *status* carries the diagnosis the log
used to bury:

| exit | meaning | what to change |
|---|---|---|
| `1` | an asset could not be reached at all | re-run; the host may be back |
| `2` | an asset downloaded fine and does not match the pin | **not** a network problem — inspect the registry or the upstream asset |

`official-data.yml` now names all three statuses (`124`/`2`/`1`) in the step summary
instead of printing `Failed with exit status N`.

### A real defect, caught by the new tests before it shipped

`classifyVerification` first set `pinProblem: !!bytesMismatch` — so *every* byte-count
mismatch, including an over-long file, was routed to the "unreachable, retry it" branch.
An over-long file cannot be a truncation; there are no missing bytes for a second attempt
to recover, and the log would have blamed a host that had answered. The two flags now
derive from one predicate:

```js
const short = actual.bytes < asset.bytes;
return { retryable: short, reason: ..., pinProblem: !short };
```

### The injection matrix

Twelve rows for the scorer, five for the fetch layer. Source restored and `diff`-confirmed
byte-identical after every row. The fetch rows are the checked-in battery at
`scripts/injection/fetch-official-retry.py`; the scorer rows are in finding 53.

| injection | result |
|---|---|
| verification moved back outside the loop (the pre-fix shape) | **6 failed** |
| the pin mismatch exits 1 instead of 2 | **3 failed** |
| an over-long file is treated as short | **1 failed** |
| the digest comparison always agrees | **2 failed** |
| the byte-count comparison always agrees | **4 failed** |

The first row is the one that matters: reverting to the original shape turns **exactly** the
six tests that encode the corrected semantics red, which is the "delete it and a test goes
red" guarantee this repository asks of every fix.

**The other four rows were misreported when this table first appeared** — as three rows
reading 2/1/2 plus one at 1. The battery had only been run ad hoc, so the figures were
reconstructed from memory. Writing it to a script and re-running produced the five measured
values above. The failure mode is worth naming because it is the same one as the finding
itself: **an unpersisted measurement is retold in a stronger, tidier form than it had** —
three plausible rows instead of five, each with a plausible count. The repair is a script.

### What this does not cover

- **The measurement still does not exist.** This finding makes the fetch survivable; it
  does not make it succeed. Whether the twelve failures were truncations, a bad pin, or
  both is **not yet known** — the new exit code is what will say, on the next run. Claiming
  a root cause beyond the code-level defect would be inventing evidence.
- **`classifyVerification` is tested against a loopback server, not against Zenodo.** The
  classification logic is pinned; the real upstream's behaviour is not.
- **The 1.19 GB asset is not exercised end to end.** The tests use small served payloads
  and a synthetic >2 GiB sparse file for the digest path, so a defect that appears only at
  real corpus scale would not be caught here.

## 53 — The M1 exit condition had no measurement, and the scorer that gives it one

P1-4. `docs/product.md` states M1's exit condition in terms of extraction accuracy: the
historical-fault channel must recover the fault type and category from an incident text at
a **strict all-fields rate of at least 70%**. Until this work, that condition had nothing
behind it but a number in a document. The pipeline existed — `importer.ts` builds the
prompt, parses the response and validates the spec — and **nobody had ever run it against
known ground truth**, so the accuracy was whatever the reader assumed it was.

### The measurement is on a runner, not in the sandbox

The honest constraint first: this development sandbox has no reachable model endpoint and no
key, and a scoring run that substitutes a stub for the model measures the stub. So the
measurement runs in `.github/workflows/fault-extraction-accuracy.yml`, on a runner with
general internet access and the organization-level DeepSeek key. That is the same reasoning
that made P0-1 possible, and the same reasoning the fourth anchor exists on.

`.github/workflows/fault-extraction-accuracy.yml` is the **first `secrets.*` reference in
this repository.** The key reaches exactly one step, is never written to a file, is never
echoed (the presence check prints its *length*, not its value), and never reaches the
artefact. `scripts/check-no-secrets.mjs` is the backstop; the workflow's own header states
the intent.

### The key is not visible to this repository, and the run said so

The workflow was dispatched on 2026-09-26 (run `36201115545`) and **failed at step 8,
`Check the key is present`**. Steps 1-7 were `success` -- including *"Validate the golden
dataset before spending a request"*, which reported `19 sample(s), schema
rca-bench-fault-golden/1` -- and steps 9 and 10, the derivation and the scoring, were
`skipped`. The job uploaded no artefact. `secrets.RCA_BENCH_LLM_API_KEY` is therefore not
visible to `AgentiX-E/rca-bench-factory`.

Two things are worth separating, because conflating them is how this becomes a story about
the environment rather than about a setting.

**It is not a network problem.** `curl https://api.deepseek.com` from inside the development
sandbox returns `401`. A `401` is the endpoint answering; an isolation failure would look
like a connection error. The sandbox that "has no reachable model endpoint" can in fact
reach the endpoint -- what it does not have is the credential. The runner has neither
restriction, so the missing piece is exactly one configuration value.

**It is not an unreadable failure, and that is the point.** The fourth anchor failed twelve
times and, at the time, nobody could say from the status which layer had broken -- the
reason was buried in a step that had already been retried, and the record of it was wrong
twice before finding 52 corrected it. This run failed once and named its own cause: the
step is called `Check the key is present`, and its message says which secret is empty and
where to set it. The guard is also placed **before** the first model request, so a
credential problem costs nothing.

> A broken instrument and an instrument that says where it is broken are different
> artefacts. The twelfth consecutive red run on the anchor was the first kind. This is the
> second. Neither is a measurement, and neither may be reported as progress towards one.

The lesson finding 52 drew -- *a mechanism whose scope is narrower than its name* -- has a
counterpart in what to do about it. That finding's repair was to widen the retry loop and
**split the exit codes so the failure class is visible**. The same instinct produced this
workflow's key check, and it is the reason this run is a two-line diagnosis instead of
another unread red X.

### Four states, not two

The first design decision, and the one the obvious implementation gets wrong. An extraction
can end in four places:

| state | meaning | charges the model? |
|---|---|---|
| `unparseable` | the response carried no usable JSON | yes — this is the model's failure |
| `unvalidated` | parsed, but `validateExtractedFault` refused it | **no** — usually a pipeline defect |
| `unverifiable` | valid, but the fault's expected signal is not in the corpus | **no** — an absence of evidence |
| `graded` | a scoreable answer | yes |

`unvalidated` is the interesting one. `importer.ts` accepted the spec and `collector.ts`
refused it, so **one of the two is wrong** — and folding that into "wrong answer" is how a
real bug in the validator hides behind a bad accuracy number. `unverifiable` is the rule
this repository already applies in `gates/validity.ts`: an absence of evidence is not a
finding, so it is not a miss either. Both were folded away in the first draft, which read
`validation.valid` and stopped there — that version reported a **hit** for a sample nothing
had checked.

### Layered rates, with their own denominators

A ratio without its denominator cannot be audited, and "type accuracy 100%" is a different
claim at 2/2 than at 200/200. Every rate is `{ hits, total, rate }`, the same shape
`coverage.ts` uses for its per-signal figures.

Every per-field figure is reported **twice**, because they answer different questions:

- **`graded`** — of the samples that produced a scoreable answer, how many got this field
  right. The model's accuracy, conditioned on the pipeline having worked.
- **`overall`** — of **all** samples, how many got this field right. What a caller running
  the channel end to end actually observes, because an unparseable response costs them the
  field too.

Collapsing the two is what makes an accuracy number arguable: a run whose real problem is a
40% parse failure can be quoted as "93% type accuracy" and nobody has lied.

### An empty cell is not a zero

A rate over zero samples is **`null`, never `0`**. `0` is a claim about the model; `null` is
a statement that nothing was measured. The same rule applies one level down, to a single
field: a sample that omits `category` is not scored as a *wrong* category.

That field-level rule has a trap behind it, and it is a trap I walked into. The rule is:

- the sample states **no** expectation for the field → `null`, excluded from the denominator;
- the sample **does** state one and the model omitted it → `false`, a real miss;
- otherwise → compare.

`validateExtractedFault` **infers** a category from the type when the model omitted one. So
a scorer that read the *validated* spec back would find `resource` sitting there and credit
the inference to the model. The scorer reads the **raw** extraction for exactly this reason,
and my first test of this behaviour asserted `null` on a fixture where the sample *did*
expect `resource` — so `false` was correct and my reasoning, though right, was attached to
the wrong fixture. Corrected into two tests that pin both directions.

### The injection matrix

Twelve rows, source restored and re-run green after each.

| injection | result |
|---|---|
| `unverifiable` collapsed into `graded` | **2 failed** |
| `unvalidated` graded as if valid | **4 failed** |
| `unparseable` graded instead of skipped | **8 failed** |
| an empty denominator reported as 0 instead of null | **6 failed** |
| an omitted optional field scored `false` instead of excluded | **13 failed** |
| the sample-id pairing check removed | **1 failed** |
| the strict rate computed over all samples instead of graded ones | **3 failed** |
| the M1 threshold relaxed to accept an unmeasured rate | **3 failed** |
| a duplicate sample id accepted | **1 failed** |
| an unexpected schema version read optimistically | **1 failed** |
| an empty dataset accepted | **1 failed** |
| case folding dropped from the comparison | **2 failed** |

**One injection did not survive being written, and the reason is worth recording.** I first
replaced `graded` with `verdicts` in the per-field loop, expecting the layered denominators
to come apart — and the suite stayed green. Investigated rather than assumed: the three
ungraded states all return the **all-null** field record, so `fields[field] !== null`
already implies `state === 'graded'` and the two expressions are equal. **The injection was
a no-op, not a hole.** The finding is that the original code carried two filters where one
carries the information, and the repair is a comment stating which one is load-bearing and
why the other is implied — not a removal, because the next reader will look for the
`state === 'graded'` test and should be told where it went.

The battery is checked in at `scripts/injection/fault-extraction-scoring.py` so this table
can be re-derived rather than trusted.

### The second injection matrix

A separate battery targets the fetch layer, at
`scripts/injection/fetch-official-retry.py`. It is deliberately **not** merged with the
matrix above: the two target different files and are never run as one unit, and a single
table covering both would describe a joint battery that does not exist. Five rows, source
restored and `diff`-confirmed byte-identical after each.

| injection | result |
|---|---|
| **verification moved back outside the retry loop** | **6 failed** |
| a pin mismatch exits 1 instead of 2 | **3 failed** |
| an over-long file classified as short | **1 failed** |
| the digest comparison always agrees | **2 failed** |
| the byte-count comparison always agrees | **4 failed** |

The first row is the one that matters, because it does not remove a guard — it restores the
**shape of the defect**. Six tests go red for it: four from the retry layer itself, and two
that encode the short/over-long directions of a digest pin. A mechanism whose scope changes
from "one chance" to "three chances" is visible to six independent assertions.

**This table's numbers were wrong on first publication, and the reason is the same defect as
finding 52.** The first version reported 1/1/3/2 across six rows, because the battery was
run ad hoc and the figures were written from memory afterwards. Checking it in and re-running
produced 6/3/1/2/4 across five. An unpersisted measurement gets retold in a stronger form
than it actually had — which is why the fix is a script, not a correction.

### The golden dataset

`golden-master/fault-extraction/samples.json` — **19 hand-written incident texts**, one per
fault, covering all seven categories (`code`, `config`, `dependency`, `middleware`,
`network`, `resource`, `runtime`). Each is written to sound like a real support ticket while
naming **exactly one** fault, so the expected record is decidable from the text alone. None
is copied from any corpus: the file is authored, reviewable, and small, which is why it is
exempted by path in `check-no-vendored-data.mjs` rather than by size.

The dataset is the denominator of the whole report, so it is validated **before any request
is spent** — a malformed sample file would otherwise be discovered at scoring time, after
nineteen paid calls. `parseGoldenDataset` names the sample and the field on every failure,
because a sample silently dropped there changes every rate in the report.

### Three exit codes, because the fourth anchor taught that two are not enough

`score-fault-extraction.mjs` is deliberately not a pass/fail gate:

| exit | meaning | what to do |
|---|---|---|
| `0` | M1 exit condition met | — |
| `2` | a measurement exists and misses the threshold | the model is not good enough yet; this is a **result** |
| `3` | no graded sample | the pipeline produced no usable answer; read the **parse** rate |

`2` and `3` call for different work, and collapsing them is precisely how the fourth anchor
ran red twelve times with nobody able to tell from the status whether the data was wrong or
the wiring was. **Failing the job on `2` would make an honest 65% look like an outage**, so
the workflow reports the verdict and does not gate on it.

### What this does not cover

- **The number does not exist yet.** The scorer, the dataset, the scripts and the workflow
  are in place and locally verified against synthetic predictions; the first real run has
  not happened, so **there is no measured extraction accuracy to report**. This finding is
  the instrument, not the reading.
- **The runner's verdict is not yet observed.** Every exit path is pinned by a contract test
  against the loopback-free local scripts (`25` tests in `fault-extraction-scripts.test.ts`),
  but the workflow's own YAML has not executed.
- **`--verifiable` is never set by the derive script.** The state exists, is unit-tested, and
  currently nothing produces it. That is deliberate — wiring a "can the verifier check this"
  answer from the model is a judgement the H3 reviewer makes — but it means the `unverifiable`
  path is exercised only by hand-written predictions today.
- **19 samples is a small denominator.** A 70% threshold over 19 samples moves in steps of
  5.3 percentage points, so the figure will be noisy at the granularity of the threshold. A
  larger dataset is future work, and the honest readout of the current one is coarse.
- **One provider.** DeepSeek is the only backend wired into the workflow. The provider
  abstraction is respected (the base URL and model come from repository variables), but no
  second provider has been run against this dataset.

---

## 54 — A count written down three times, and wrong in all three

This one was not found by a test, an injection or a coverage gap. It was found by
trying to write a new sentence and needing the number it contained.

### The defect

Three documents stated how large the enumerated export surface is, and all three
disagreed:

| where | said | actual |
|---|---|---|
| `export-surface-enumerated.test.ts`, in its own comment | 43 modules | 47 |
| `audit.md`, finding 50 | 45 modules, 516 exports | 47, 538 |
| `progress.md`, the L3 headline row | 46 modules, 516 symbols | 47, 538 |

All three were correct when written. The list grew by four modules across passes 12
and 13 and none of the three was re-read. This is the same decay the Repository table
in `progress.md` already names for itself, but in prose rather than in a table, and
prose has no column header to remind a reader that it is a measurement.

### Why it matters more than three wrong numbers

The surface enumeration is the mechanism this repository uses to make "the export
surface is fully tested" a *claim* rather than a *truism*. Its whole design is that
`ENUMERATED_MODULES` is asserted equal to the modules on disk, so the list cannot
drift. That guarantee is real and it holds — the list is correct.

What drifted was the **description** of the list. So the mechanism was doing its job
perfectly while three separate narrative claims about it were stale. Anyone auditing
this repository would have read "45 modules" and then read a list containing 47, and
would have had to decide which to believe. The correct answer is the list, but that
is only obvious to someone who already knows how the gate works.

**A count that describes a list must be read from the list, or it is a second source
of truth, and a second source of truth is a source of disagreement.**

### The repair

- The test file no longer states a count at all. It says why, and points at the
  assertion that makes the list authoritative.
- The two dated figures in the docs are marked as measurements of the pass that
  produced them, with the current values given alongside.
- The runtime-export count (**538**) and the exemption breakdown (**37 entries: 2
  runtime, 35 type aliases**) are stated once, in one place, derived by probe rather
  than recalled.

### What this does not cover

- **Nothing prevents the next literal.** This is the third instance in this
  repository of a number outliving its measurement, and the repair is again local.
  The general fix would be to generate the counts into the docs the way
  `gen-examples.mjs` generates the field tables, which is P2-4 and still open.
- **`538` is a probe count, not a gate count.** It was obtained by re-implementing the
  gate's own extraction over `src/`, because the gate's helpers are not exported. If
  the gate's definition of "runtime export" differs by a symbol or two from the
  probe's, the probe's figure is the one that is wrong. The defensible claim is
  "roughly 538, and exactly as many as the gate scans" — and making it exact is a
  small, separate piece of work.

---

## 55 — "The sandbox has internet access" was an assumption, and it is wrong

The development sandbox this repository is built in has been described, in this
audit and in the workflows' own comments, as having internet access. That phrasing
has been load-bearing: it is the stated reason the fourth anchor runs on a runner
rather than locally, and it is why the extraction measurement was put on a runner
too. It was never measured until now.

| host | HTTP | |
|---|---|---|
| `api.deepseek.com` | **`401`** | reachable — the endpoint answered without a key |
| `ollama.com` | `200` | reachable |
| `api.github.com` | `200` | reachable |
| `api.openai.com` | `000` | **unreachable** |
| `api.anthropic.com` | `000` | **unreachable** |
| `generativelanguage.googleapis.com` | `000` | **unreachable** |
| `registry.npmjs.org` | `000` | **unreachable** |
| `pypi.org` | `000` | **unreachable** |

Measured 2026-09-26. The shape of the result is not "networking is broken" -- three
hosts answer normally. It is that egress is **allow-listed, and the list is narrow**:
among model APIs, exactly one is reachable, and it is the one this project already
targets.

### Why the wrong assumption survived this long

Because it was never load-bearing in a way that could fail. Every operation that
depended on the outside world ran on a runner. Locally, the only thing that actually
needed the network was installing dependencies, and `registry.npmjs.org` returning
`000` does not break that:

```
pnpm install --frozen-lockfile --offline   ->  Done in 529ms
```

The store was already warm. A cached install looks exactly like a successful online
install, so the absence of a route stayed invisible. This is the same shape as
findings 47, 49, 50, 51 and 52 -- *a mechanism whose scope is narrower than its
name* -- except the mechanism here is a **belief**, and the name it is narrower than
is "internet access".

### Two consequences worth writing down

**New dependencies may not be installable.** Anything that needs a package not
already in the store will fail, and it will fail in a way that looks like a typo or
a version conflict rather than a blocked route. Any plan of the form "install X and
try it" must first confirm the host it fetches from is reachable.

**There is one reachable model endpoint, and the measurement still cannot run on
it.** `api.deepseek.com` answers `401`, so a local derivation would need exactly one
thing this sandbox does not have: a key. The adapter is already in the core package,
the dataset is checked in, and both scripts' exit-code paths have now been exercised
end to end. So the local route is *one secret away* from producing a number.

It should still not produce *the* number, and finding 53's reasoning is why. A local
run would use `deepseek-chat`, an alias that points at whatever backend the vendor
is serving that week -- the workflow passes the model through a repository variable
precisely so it can be pinned, and that variable is currently unset. It would also
reach the endpoint through a different edge (`...eo.dnse1.com`) than a runner
likely would. Two runs whose model is not pinned and whose network path is not
compared do not measure the same thing, and a number that looks the same is not
evidence that they did.

> A number's value depends on its denominator and on whether its source is pinned.
> Nineteen samples, an unpinned model alias and an unverified edge together are
> enough to make a passing score unauditable -- and an unauditable pass is worse
> than an honest failure, because nothing about it invites a second look.

---

## 56 — An injection battery mutates a checked-in file, and that is not compatible with a concurrent reader

### What was observed

A local gate run went red on a test that could not be red:

```
FAIL  test/llm/workflow-provider.test.ts > the workflow forwards the registry-owned
variable names > keeps the endpoint and model optional and out of the file
AssertionError: expected '...' to match /RCA_BENCH_LLM_BASE_URL:\s*${{ vars./
```

The assertion is that the endpoint comes from a repository variable rather than a
hard-coded vendor URL. The workflow does exactly that, in every revision ever
committed, and still does:

```
$ grep -n 'RCA_BENCH_LLM_BASE_URL' .github/workflows/fault-extraction-accuracy.yml
200:          RCA_BENCH_LLM_BASE_URL: ${{ vars.RCA_BENCH_LLM_BASE_URL }}
```

So the file on disk matched the assertion, and the test that read it failed. Those
two facts cannot both be true of the same bytes, which means the test did not read
the file that is on disk.

It had not. The injection battery for this workflow
(`scripts/injection/fault-extraction-workflow.py`) works by writing a fault into
the workflow, running the gate, and restoring it -- and it was running at the same
time as `pnpm test:coverage`. The reader observed an injected revision.

### Why this was not "flaky" and should not have been treated as such

The tempting reading is that a test raced a file and the fix is to re-run it. That
reading is wrong twice over.

First, **the failure was self-inflicted and fully deterministic in cause**. There is
no nondeterminism in *whether* the battery exposes a non-pristine revision -- it
must, that is its purpose. The only variable is whether a reader happens to look
during the window. A test that fails when an unrelated process is doing its job is
not flaky; it is *correctly reporting a real shared-state conflict*.

Second, and worse than a wrong red: the window included an **empty file**.

```
$ python3 /tmp/race-probe.py          # reader polling while the battery ran
distinct states observed by the concurrent reader: 11
  5c3861a96222459f  x1238   NON-PRISTINE
  ...
  e3b0c44298fc1c14  x4      NON-PRISTINE   <-- sha256 of the empty string
```

`e3b0c44298fc1c14` is the sha256 of zero bytes. `Path.write_text` opens with
`O_TRUNC` and then writes, so between the truncate and the write the file is empty,
and a reader that lands in that window sees nothing at all. Four reads of zero
bytes in one battery run.

That changes the failure mode from *misleading* to *undiagnosable*. A reader that
observes a wrong-but-valid revision fails on a plausible assertion and sends
someone to look at the wrong thing. A reader that observes an empty file fails to
`SyntaxError` or a schema error, and then re-reads the file, finds it intact, and
concludes the failure was spurious -- because it was. Nobody investigating that
would suspect a race they have no evidence for.

### The repair, and the measurement that showed it was incomplete

Every mutation was routed through one helper that writes a temporary file in the
destination directory, fsyncs it, and `os.replace`s it into position. On POSIX that
rename is atomic, so a reader observes one revision or the other and never a
mixture.

Re-running the reader probe showed the empty-file state was gone and non-pristine
revisions were still observable -- which is correct, and is the distinction the
first version of this finding got wrong:

- **Visibility of an injected revision cannot be eliminated.** The battery's purpose
  is to make a fault visible to the gate. That is by design.
- **Visibility of a truncated or empty file can be eliminated**, and must be.

The probe said the fix had *not* eliminated it:

```
--- run 2 ---
reads: 23196
zero-byte observations: 1        <-- still there
```

One zero-byte read survived. The cause was the site the fix had not touched:
the final crash-recovery restore, which used `shutil.copyfile`. Measured in
isolation, with a reader polling a large file:

```
shutil.copyfile                    reads=      18 zero-byte=2
os.replace                         reads=      13 zero-byte=0
```

`copyfile` truncates its destination too. Routing only `write_text` through the
helper had produced a file that *looked* fully repaired -- the obvious pattern was
gone -- while one `O_TRUNC` writer remained. The first fix was found by reading the
diff; the remaining hole was found only by re-measuring.

Five runs after routing that last site through the helper, ~116,000 reads:

```
run 1..5:  zero-byte observations: 0   truncated (<20 lines): 0   distinct revisions: 10
```

### What the two gates are, and how they were verified

The battery now has two subjects, and both are gated:

| Gate | Subject | Injections | Result |
|---|---|---|---|
| `test/llm/workflow-provider.test.ts` | the workflow cannot drift from the provider registry | 9 | 9 caught, control green |
| `test/injection-write-discipline.test.ts` | every mutation goes through the atomic helper | 2 | 2 caught, control green |

The second gate is asserted against the battery's **source**, not by racing it. A
race-based test would pass on the broken version whenever the reader missed the
window, and a test that fails one run in ten is worse than no test. The two
injections restore a direct `write_text` and reinstate `shutil.copyfile`; both go
red.

### The rule this adds

> A test that reads a checked-in file is not isolated from a process that rewrites
> that file, and neither atomicity nor a green re-run makes it so. Atomicity bounds
> the damage from *unreadable* to *readable but wrong*; it cannot make the reader
> see the revision it expected, because there is no expected revision while a
> battery is mid-injection.

The operational consequence: **an injection battery is not run concurrently with
the suite.** `package.json` does not express that, and nothing enforces it, so the
mitigation is written at the top of the battery and the residual exposure stays on
the unmeasured list rather than being declared solved.

### What this does not cover

- **Concurrent execution is mitigated, not prevented.** A guard that lets the
  battery take a lock, or makes the suite refuse to start while one is held, would
  close it. Not implemented; the exposure is a wrong red whose cause is now
  documented.
- **Other checked-in files are not audited for this.** The battery mutates one file.
  Whether any other script mutates a tracked file while tests read it was not
  surveyed.
- **The non-pristine window is unquantified.** Ten distinct revisions were observed,
  and how long each is in place was not measured, so "a reader can see one" is
  established but "how likely" is not.

---

## 57 — The measurement ran, and its number is unreadable from here

### What is established

`fault-extraction-accuracy.yml` was dispatched against `842daee` (run `36216622078`)
and **every step succeeded**, including the three that had never executed:

```
  8. Resolve the LLM provider                         success
  9. Select the key for the resolved provider         success
 10. Derive the extractions                           success
 11. Score the run                                    success
 12. Upload the predictions and the report            success
 13. State the verdict                                success
```

The artefact is no longer empty: 3378 bytes against `total_count: 0` on both prior
runs, with digest `sha256:729ed7bc...`.

So the provider-registry repair worked end to end. The organisation's existing key
was used without being duplicated under a second name, which was the whole point.

### What is *not* established, and why the green is not the reading

**The run produced a measurement. It did not necessarily meet the threshold, and I
cannot read which.**

That is not a hedge -- it is forced by the scorer's exit contract. Step 11 exits `1`
on `3` (no measurement) and on `1` (unreadable), and the step would therefore be red.
It is green, so the score exit was **`0` (met) or `2` (measured, not met)**. Both are
possible; the resolution between them is exactly the number, and the number is what
is missing.

The paths to it, and why each failed:

| Path | Result |
|---|---|
| job log body (`/actions/jobs/<id>/logs`) | 302 → `productionresultssa17.blob.core.windows.net` → `http=000` |
| artefact zip (`/actions/artifacts/<id>/zip`) | 302 → `productionresultssa7.blob.core.windows.net` → `http=000` |
| job summary via REST | no such endpoint (`404`) |
| run page HTML | renders, but loads the summary dynamically; the body is absent |
| run page via a fetch tool | same, plus the artefact appears only as a digest |

The blob host resolves to `198.18.0.36`. That is inside `198.18.0.0/15`, the same
sinkhole range finding 55 measured for the CI log host, so this is the egress
allowlist rather than a transient fault. It is the **fifth** consecutive round in
which a CI log body was unreachable, and the **first** in which an artefact was also
unreachable.

### The distinction this pass must not blur

Three states have been confused at least once each in this repository's history, and
keeping them apart is the whole content of this finding:

| Statement | Status |
|---|---|
| the workflow reaches the model | **established** -- steps 8-11 all succeeded |
| a measurement exists | **downgraded by finding 58** -- see the correction below |
| the threshold is met | **not established** -- this is `0` vs `2`, and both are consistent with a green job |
| the value of the rate | **not established** -- the artefact carrying it is unreachable |

> "The run succeeded" is not a reading, and it is not a failure either. It is the
> statement that the instrument worked, which is a different claim from the one the
> instrument exists to make.

#### Correction (finding 58): the run was configured with a disabled model name

This finding originally recorded `a measurement exists` as **established**. That was
too strong, and the reason is worse than a missing check.

`RCA_BENCH_LLM_MODEL` was set to `deepseek-chat` for this run. That alias was
**disabled on 2026-07-24**, two months before the dispatch. The run therefore sent
nineteen requests to a model name that the provider rejects.

The step timings say the requests did not come back as answers:

```
10. Derive the extractions                           23.0s
```

Nineteen samples at a 250ms serialisation gap is 4.75s of pure pacing, leaving
18.25s for nineteen HTTP round trips -- **0.96s each**. A real completion for these
prompts takes seconds per call, not one; a rejected request returns in a fraction of
a second. The run very likely spent most of that step waiting on the pacing sleep
rather than on the provider.

Step 11 still succeeded, and the check run carries no `No measurement` error
annotation, so `score_exit` was `0` or `2` rather than `1` or `3` -- meaning at least
one sample was graded. What cannot be claimed is that the graded answer came from a
model. The honest statement is narrower than the original one:

| Statement | Corrected status |
|---|---|
| the workflow reached the provider | **established** |
| the provider accepted the request | **no** -- the model name was disabled |
| a measurement was computed | **established** (a rate was produced from at least one graded sample) |
| the number describes model behaviour | **not established** -- it describes a run configured against a retired alias |

The lesson is not "check the model name". It is that **the run was reported green and
I read the green as a successful measurement**, when the one field that would have
exposed the problem -- the model actually used -- was never validated against the
vendor's live list. A constant chosen from memory, in a repository whose whole subject
is measurement discipline.

### What would close it

The model name is corrected to `deepseek-flash` and pinned as a repository variable,
so a re-dispatch asks a model that exists. The figures are also now repeated as a
check-run annotation, which the REST API serves, so the reading is obtainable from an
allow-listed sandbox rather than only from the UI or a blob host.

Until a re-dispatch lands, "M1 met or not" stays open, and `09` must not tick it.

### What this does not cover

- **Nothing about the model's quality.** Whether the rate is 40% or 80% is unknown
  here; and the number the previous run produced is not a reading of model behaviour
  at all, per the correction above.
- **The name is pinned, but the model behind it is not.** `deepseek-flash` currently
  serves DeepSeek-V4.1-Flash, and the vendor states that the previously-accepted
  `deepseek-v4-flash` is itself retired and routed to the same model. Pinning the
  *current* name is the correct choice -- `deepseek-v4-flash` would have been one
  deprecation away from this identical failure -- but it does not freeze the weights.
  A vendor model update changes the number without changing configuration, and the
  only defence is that the artefact records the name, so a shift is at least
  attributable to a window.

---

## 58 — The model name was a disabled alias, and I read a green run as a measurement

### What was wrong

`RCA_BENCH_LLM_MODEL` was set to `deepseek-chat`. That name, and `deepseek-reasoner`,
were **disabled on 2026-07-24 15:59 UTC** — two months before the dispatch. The run
therefore sent nineteen requests to a model the provider rejects.

`DEEPSEEK_DEFAULT_MODEL` was the same string, so the defect was not confined to a
variable an operator had set: **any run that omitted the variable failed the same way**.

### Why the green job hid it

Every step succeeded, and I reported that as "the workflow reached the model". The
step timings refute the stronger reading:

```
10. Derive the extractions                           23.0s
```

19 samples × 250ms pacing = 4.75s of pure delay, leaving 18.25s for nineteen HTTP
round trips — **0.96s each**. A real completion takes seconds; a rejected request takes
a fraction of one. The step spent most of its budget asleep.

| Statement | Corrected status |
|---|---|
| the workflow reached the provider | established |
| the provider accepted the request | **no** — the model name was disabled |
| a rate was computed | established (step 11 was green, so exit `0` or `2`) |
| that rate describes model behaviour | **not established** |

The lesson is not "check the model name". It is that **a green run was read as a
successful measurement**, when the one column that would have exposed the problem —
the model actually used — was never validated against the vendor's live list. A
constant chosen from memory, in a repository whose subject is measurement discipline.

### The replacement, and why it is not the obvious one

`deepseek-flash`. Not `deepseek-v4-flash`: that name is **itself retired** — kept only
as a compatibility route to V4.1-Flash since 2026-09-10 — so pinning it would have
bought a few months and a second identical incident. `deepseek-flash` is the name
DeepSeek's own documentation instructs callers to use.

`registry.ts`'s `'deepseek-chat': 'deepseek'` is **unchanged**. That is a *provider*
alias, not a model name — the line that lets an organisation keep its existing
variable name. Two occurrences of the same string with different meanings is why this
fix had to be classified entry by entry rather than replaced globally.

---

## 59 — The reading exists, and M1 is not met: strict 0/19

### The reading

Run `36226968552` against `dec77b3`, dispatched with `RCA_BENCH_LLM_MODEL=deepseek-flash`.
Every step succeeded, and for the first time the number came back **through the REST
API** — as a check-run annotation, which is the channel this sandbox can actually read:

```
samples=19  graded_count=19  graded_rate=19/19 (100.0%)  strict=0/19 (0.0%)
m1=NOT MET (>= 70% strict)
```

**M1 is not met.** Strict all-fields is 0%.

### Why that is two results, not one

The two rates disagree, and the disagreement is the finding:

| Layer | Value | What it says |
|---|---|---|
| graded | **19/19 (100%)** | every sample parsed *and* validated — the pipeline is not broken |
| strict | **0/19 (0%)** | every graded sample missed at least one scored field |

A single blended figure could not express this, which is the argument finding 53 made
for layered rates and this run is the first evidence for it.

It also rules out the reading that would have been wrong twice: **this is not "the
pipeline produced nothing"** (exit `3`, which would have turned step 11 red) and it is
not "the model is correct" (exit `0`). It is a model that answers in a readable shape
and gets no sample fully right.

### What is established, and what is not

| Statement | Status |
|---|---|
| the run reached the model, and the model answered | **established** — 19 graded samples |
| the pipeline parses and validates its answers | **established** — 100% |
| strict all-fields meets the 70% threshold | **not met** — 0/19 |
| *which* field fails, and why | **not yet established** |

The last row is the open question, and it is answerable: the report prints a per-field
breakdown, so the score step now echoes those four rows as a second annotation. The
headline said *that* it failed; the breakdown says *where*.

### The channel, separately

The previous three rounds could not read the number at all, and every documented route
had a structural reason: `GITHUB_STEP_SUMMARY` is not a field on the run or job
object, the job-log endpoint 302s to a blob host inside `198.18.0.0/15`, and the
artefact zip does the same. `GET /check-runs/{id}` was found by probing endpoints
rather than by assuming they would fail, and it serves annotations over REST.

That this worked is worth separating from the result it delivered. The instrument
being readable is what makes "M1 not met" a finding rather than a fourth
inconclusive round.

---

## 60 — The per-field breakdown, and why 0/19 is three problems not one

### The reading

Run `36227614249` against `262fc0d` carried the per-field annotation added in finding 59:

```
type=5/19  category=11/19  component=3/19  description=0/0
```

with the headline unchanged:

```
samples=19  graded_count=19  graded_rate=19/19 (100.0%)  strict=0/19 (0.0%)
m1=NOT MET (>= 70% strict)
```

### What it changes

`strict=0/19` was a true but unactionable statement: it said no sample was fully
correct without saying why. The breakdown resolves it into three separable problems,
and they have different fixes:

| Field | Graded | Rate | Reading |
|---|---|---|---|
| `type` | 5/19 | **26.3%** | the model's fault-type label rarely matches ours |
| `category` | 11/19 | **57.9%** | partially aligned — the vocabulary works, but not reliably |
| `component` | 3/19 | **15.8%** | the worst field; naming conventions diverge |
| `description` | 0/0 | n/a | correctly excluded — no sample states an expectation |

Three things follow that the single number could not have told us:

1. **It is not one broken field.** All three scored fields are weak, so `0/19` is the
   arithmetic consequence of three sub-threshold fields, not of a single outlier.
   Fixing `category` alone would still leave `strict` at 0.
2. **The prompt is not being ignored.** `category` at 57.9% is well above chance across
   seven vocabulary values, so the model is reading the schema and attempting to comply.
   The failure is vocabulary alignment, not instruction-following.
3. **`description` being excluded is correct, not a gap.** Zero samples state an
   expectation for it, and scoring a model for an omission the ground truth made is the
   error finding 53 warned about. Its `0/0` is the mechanism working.

### This reproduces, which matters more than the value

Two runs, seven minutes and one revision apart, agree exactly on both rates:

| Run | sha | graded | strict |
|---|---|---|---|
| `36226968552` | `dec77b3` | 19/19 | 0/19 |
| `36227614249` | `262fc0d` | 19/19 | 0/19 |

The consistency is evidence that this is a stable property of the configuration rather
than sampling noise, which is what makes the per-field rates worth acting on. A single
`0/19` could have been an unlucky run; two identical `0/19`s with a stable `19/19`
graded rate cannot.

### What this does not establish

- **Whether the misses are normalisation gaps or genuine model errors.** This is the
  next question and it is a code-versus-prompt decision. It needs the predictions
  themselves, which are in the sinkholed artefact; the rate alone cannot distinguish
  "the model said `network-ap-saturation` and we wanted `network`" from "the model
  said `disk-full`". The distinction has to be settled by reading answers, not rates.
- **Whether 70% is reachable by prompt work at all.** Every field is far below it, and
  `component` at 15.8% suggests a naming-convention gap that a prompt change may not
  close.

---

## 61 — The component field's ceiling: 5 of 19 samples cannot be matched without guessing

### Why this was checked without the predictions

Finding 60 named the open question precisely and could not answer it: are the
`component` misses normalisation gaps (a code fix) or naming-convention divergences
(a prompt fix)? The predictions live in the sinkholed artefact, so the plan was to
go and fetch them.

The dataset answers part of it on its own, and it was not being asked. For every
sample, is the *expected* `component` a string that appears in the incident text
the model was shown?

| Relationship between the expected `component` and its incident text | Count |
|---|---|
| Appears verbatim (`checkout-api`, `order-service`, ...) | 5/19 |
| Appears only as spaced prose (`billing-service` vs "the billing service") | 9/19 |
| **Does not appear in any form** | **5/19** |

The five in the last row are not paraphrases of something in the text. They name a
component the text never identifies under that name:

| Sample | Expected `component` | What the text actually says |
|---|---|---|
| `network-delay-cart-to-inventory` | `cart-service` | "Cart-to-inventory calls got slow" |
| `middleware-redis-latency-cache` | `session-cache` | "the session Redis" |
| `middleware-kafka-consumer-lag` | `order-events-consumer` | "Consumer group order-events" |
| `config-feature-flag-checkout` | `checkout-ui` | "the storefront" |
| `middleware-mysql-replica-lag-analytics` | `analytics-replica` | "The analytics dashboard" |

### The middle row is not a gap — this was checked, not assumed

It is tempting to file the 9 spaced-prose cases under "normalisation gap" and stop.
They are not, and the check is one line against the shipped build:

```
"billing-service"      "billing service"          MATCH
"checkout-ui"          "checkout UI"              MATCH
"analytics-replica"    "the analytics replica"    MISS
"session-cache"        "the session Redis"        MISS
"cart-service"         "Cart-to-inventory"        MISS
```

`normalizeFaultType` lower-cases and collapses whitespace to hyphens, and `sameValue`
applies it to **both** sides. So a model that answers `billing service` already scores
a hit. The hyphen convention was never the problem, and "add a hyphen-insensitive
comparator" would have been a fix for a defect that does not exist — the exact class
of change that finds work for itself.

### What this establishes, and what it does not

**Establishes:** `component`'s ceiling from this dataset is **14/19 (73.7%)**, not
19/19. Five samples require the model to produce an identifier that the input does not
contain, which is not extraction — it is guessing a naming scheme. At 3/19 (15.8%)
the model is well short of even that ceiling, so there *is* real headroom; but a
perfect run on this dataset still cannot reach 100% on `component`.

**Does not establish:** whether the five are wrong. This is the part that still needs
the predictions. Two readings remain open and they point in opposite directions:

1. **The dataset is under-specified.** If the model answered `inventory-service` for
   the first row, the ground truth is asking for a name the text withheld, and the fix
   is to the golden data — a benchmark whose ground truth is not derivable from its
   input measures the annotator, not the model.
2. **The text encodes the answer by convention.** `session-cache` for "the session
   Redis" is the *role* rather than the *technology*, and a component field plausibly
   means the role. If the model answered `redis`, the schema is under-specified rather
   than the data being wrong.

The distinction needs the answers. What has changed is that the question is now
**bounded**: it is about 5 named samples, not about the whole field.

### The consequence for M1

`type` 26.3% and `category` 57.9% are unconstrained by this — both vocabularies are
closed and stated in the prompt, so their ceilings are 19/19 and their misses are
real. `component` is the one scored field whose ceiling is below 100% for reasons in
the data rather than in the model.

This does not change the verdict. M1 is `strict`, and `strict` needs every scored
field at once; with `component` capped at 73.7% and `type` at 26.3%, the binding
constraint is still `type`. But it does change what a good `component` fix looks like:
the ceiling has to be raised deliberately, by either tightening the golden data or
stating the naming rule in the prompt, not by adding comparator tolerance.

---

## 62 — `type` at 26.3% is an unstated-vocabulary problem, and the prompt can be blamed precisely

### The asymmetry inside the prompt

Finding 60 left `type` as the binding constraint at 5/19 (26.3%) without saying why it
is the *worst-explained* field rather than merely the hardest. Reading the prompt
answers it, because the prompt treats the two closed-vocabulary fields inconsistently:

```
{ "type": "fault type (short)", "category": "one of: resource | network | runtime |
  middleware | code | config | dependency", "component": "faulty component",
  "description": "root-cause reason", "confidence": 0.0..1.0 }

`category` is matched case-insensitively against that list; any other value is rejected.
```

`category` gets a **closed vocabulary**, an explicit statement that it is closed, and a
comparison rule. `type` gets the words "fault type (short)" and nothing else — no
vocabulary, no grammar, no length. And the expectation is a *canonical slug*:

| Property of the expected `type` | Value |
|---|---|
| Samples whose expected `type` appears verbatim in the incident text | **0/19** |
| Distinct expected labels | **19 of 19** (no label repeats) |
| Label length range | 8–35 characters, mean 17.3 |
| Longest | `database-connection-pool-exhaustion` (35) |

So the model must turn `"the pod sat pinned at its 500m limit"` into `cpu-saturation`,
and `"all 20 are held by threads waiting on a lock held by a transaction that is itself
waiting for a connection"` into `database-connection-pool-exhaustion`. Neither string
occurs in the input. The prompt does not say the answer is a hyphenated slug, does not
say how long, and does not hint at granularity.

### Why the measured 26.3% is consistent with this and not with "the model is bad"

Two readings fit 5/19, and the dataset separates them:

- **Unstated vocabulary.** `category` — the field that *is* specified — scores 57.9%,
  more than double. Same model, same prompt, same incident texts. The only variable
  that moves is whether the output space is stated. That is a strong signal that the
  prompt, not the capability, is what differs between 57.9% and 26.3%.
- **Genuine capability failure.** A 26.3% figure with an unstated 19-way label space
  cannot be read as "the model cannot classify faults", because nothing told it what
  the labels are.

**This is a prompt defect, not a code defect.** No comparator change helps: the model is
not producing a near-miss of `cpu-saturation` that normalisation fails to fold, it is
producing something from an unbounded space. Unlike finding 61, there is no ceiling
argument to make — a stated 19-label vocabulary is derivable from the input, so
`type`'s ceiling is 19/19 and 26.3% is fully fixable.

### What this does not establish

- **That stating the vocabulary reaches 70%.** It removes a structural handicap; it
  does not guarantee the model picks the right label from a stated list. The next
  reading is what tests that, and it is a real experiment rather than a formality:
  `category` at 57.9% with a stated 7-value vocabulary is the closest available
  estimate for what a stated `type` vocabulary buys, and 57.9% is still below 70%.
- **Which of the two fields to specify first.** `category` is already specified and
  still misses 42%; that suggests the residual is capability, not specification. So
  the honest expectation is that `type` improves substantially and *still* lands
  short, which would make `category` the thing that decides M1.

### The fix this implies, stated as a prediction to be tested

Adding the 19 expected labels to the prompt as the allowed `type` values would be
fitting the prompt to the test set, and is not proposed. What is proposed is the same
treatment `category` already gets: a stated vocabulary. Two versions are worth
measuring, and the second is the more honest experiment:

1. **The closed list.** State `FAULT_TYPES`, mirroring `FAULT_CATEGORIES`. Expect a
   large `type` jump and a new failure mode where the model picks a neighbouring label.
2. **A stated grammar.** Say `type` is a lower-case hyphenated slug naming the mechanism
   (`<subject>-<failure>`), and leave the vocabulary open. This tests whether the miss
   was the *format* or the *space*, which is the distinction that decides whether this
   repository needs a fault-type ontology at all.

Version 2 is the one that would generalise past this dataset, and it is cheap to run
because the instrument is now known to work end to end.

---

## 63 — The shape rule is stated, and what would falsify it

### What changed

`buildFaultExtractionPrompt` now carries a shape rule for `type`, which was the only
scored field the prompt left undescribed:

```
`type` is a short lower-case hyphenated slug naming the failure mechanism, e.g.
`cpu-saturation`, `network-delay`, `database-connection-pool-exhaustion`. Use
hyphens, never spaces or capitals. Prefer the mechanism over the symptom.
```

### Why the grammar and not the labels

Listing the 19 expected labels would raise `type` by fitting the prompt to the test
set, and the resulting number would mean nothing: it would report that the model can
copy from a list it was handed, on the same 19 samples the list came from. Worse, it
would be read as progress.

The grammar is the part that transfers. A fault this repository has never seen still
has to be named, and the naming convention is what the model needs to know to name it
the way the schema expects. A closed fault-type ontology is a legitimate goal for a
different reason -- bounded labels make aggregation possible -- but it is a separate
decision, and the code comment says so, because collapsing the two would produce a
number that cannot be interpreted as either.

### Two halves, again

This is the second time a prompt rule and a parser tolerance have been paired, and
the pairing is deliberate for the same reason as `category`'s casing fix: the prompt
states the rule so the model is not left to guess it, and the comparator already
tolerates the obvious deviation (`normalizeFaultType` folds case and spaces on both
sides) so a model that guesses the format anyway does not lose a correct answer.

The difference from `category` is where the tolerance stops. `category` is closed, so
a value outside it is *rejected*. `type` is open, so nothing is rejected and every
answer is scored on label choice. That is the intended asymmetry: one field has a
closed answer space and the other has an open one, and the prompt now describes each
according to which it is.

### Tests were written first and observed red

| Stage | Result |
|---|---|
| Tests written, before any source change | **2 failed / 6 passed** |
| After adding the shape rule | 8 passed |
| Injection: remove the rule from the prompt | **2 failed** (the two prompt tests) |
| Injection: make one expected `type` camelCase | **2 failed** (two *different* tests) |

The 6 that passed before the change are the point: they assert properties of the
*dataset*, and they held already. That is what makes the rule a description of the
existing data rather than a new requirement invented to make a test pass. Had they
failed, the rule would have been wrong and the right fix would have been to the data.

The two injections failing *different* pairs is the other thing worth having: it means
the suite checks two independent properties -- the prompt states the rule, the data
obeys it -- rather than one assertion written twice.

### What would falsify the finding

The fix is a prediction, and it is testable in one run:

- **If `type` does not move materially**, finding 62's attribution is wrong and the
  low score was capability rather than specification. The next suspect would be the
  19-way open space itself, which would make the closed-list variant the right
  experiment.
- **If `type` moves a lot but `strict` stays 0**, the prediction recorded in finding 62
  holds: `category` at 57.9% with an already-stated vocabulary becomes the binding
  constraint, and M1 then depends on a field whose prompt was never the problem.
- **If `type` moves and `component` does not**, finding 61's ceiling argument is
  confirmed as the reason `component` is stuck, and the remaining work there is a data
  or schema decision rather than a prompt one.

All three are decided by the same annotation the workflow already emits, so no new
instrumentation is required to read the answer.

---

## 64 — The shape rule bought one sample, and finding 62's prediction is refuted

### The reading

Run `36229820836` against `9c72a56026`, the first run carrying the `type` shape rule:

```
samples=19  graded_count=19  graded_rate=19/19 (100.0%)  strict=1/19 (5.3%)
m1=NOT MET (>= 70% strict)

type=6/19  category=11/19  component=3/19  description=0/0
```

### Against the previous run

| Field | `262fc0d` (before) | `9c72a56` (after) | Δ |
|---|---|---|---|
| `strict` | 0/19 (0.0%) | **1/19 (5.3%)** | **+1** |
| `type` | 5/19 (26.3%) | **6/19 (31.6%)** | **+1** |
| `category` | 11/19 (57.9%) | 11/19 (57.9%) | 0 |
| `component` | 3/19 (15.8%) | 3/19 (15.8%) | 0 |
| `description` | 0/0 | 0/0 | — |

### Finding 62's prediction is refuted, and that is the result

Finding 62 predicted that giving `type` the treatment `category` already had would
produce "a large `type` jump", and offered outcome 1 explicitly: *"if `type` does not
move materially, finding 62's attribution is wrong and the low score was capability
rather than specification."*

`+1 sample` is not a material move. **1 of 19 went from wrong to right.** The
attribution was wrong, and the pre-registered falsification is what makes that a
finding rather than a reinterpretation: the prediction was written down before the
run, with the reading that would refute it, and the run produced that reading.

The honest summary is that **the shape rule was cheap to test and it did not work.**
It is not harmful -- `strict` moved off zero for the first time, and `category` and
`component` were untouched as expected -- but an effect of one sample on a 19-sample
set is within the range that a re-run alone could produce, and it would be wrong to
describe the prompt as improved. The rule stays because it states a true and useful
property of the schema, not because it is a fix.

### What `strict` going to 1/19 does and does not mean

It means a sample exists that is now fully correct, so the pipeline can in principle
produce a strict hit and M1 is not a structural impossibility. It does **not** mean
progress toward 70%: one sample is 5.3%, the bar is 70%, and 12 more samples would
have to become fully correct.

### The alternative that finding 62 named is now the live one

Finding 62 proposed two variants and argued for the grammar over the closed list. The
grammar moved one sample. The remaining suspect is the one finding 62 explicitly
deferred: **the 19-way open label space itself.** With the format now stated and the
score barely changed, "the model does not know which label we want" is a stronger
explanation than "the model does not know the format".

That reframes `type` and `category` as **one problem rather than two**. `category` is a
*closed* vocabulary, it was never the subject of a prompt defect, and it still sits at
57.9% -- a 42% miss rate against a stated 7-value list. If specification is not what
holds `category` back, specification is probably not what holds `type` back either,
and the two figures (57.9% and 31.6%) are ordered the way one would expect from
difficulty (7 choices versus an open space) rather than from the prompt asymmetry
finding 62 identified.

### What the next experiment should be

Not another prompt variant. The three rates are now consistent with a **capability
ceiling for this model on this task**, and the cheap way to test that is to change the
model, not the prompt: run the same revision against a stronger provider through the
existing registry. If `category` stays near 58% across providers, it is the task; if it
moves, it is the model.

That experiment needs no code change -- `RCA_BENCH_LLM_MODEL` is a repository variable
and the registry is provider-agnostic by construction -- which is the first time this
project's LLM abstraction pays off as a measurement instrument rather than as
architecture.

---

## Finding 65: the miss diagnosis answers a question the last four rounds could not

Four rounds of reasoning about `type` and `category` produced four hypotheses, three of
which needed a dispatch to test and one of which was refuted by its own pre-registered
condition. The miss diagnosis settles the underlying question without spending a run, and
the reason is embarrassing: **the answers were already being recorded.**

`scripts/derive-fault-golden.mjs` writes every prediction's `type`, `category`, `component`
and `description` into the artefact the scorer reads. The scorer's report printed the
*rates* and nothing else, so the per-sample answers were present and unreadable. The
reading was missing, not the data. Adding `misses` and `missClassification` to
`ExtractionReport`, and two lines to the printout, exposes what was already on disk.

The diagnosis distinguishes **`wrongValue` from `omitted`**, which is the distinction the
previous rounds could not draw. A wrong value is the model's answer being incorrect; an
omission is the model declining to answer. They have different fixes — a prompt shape rule
addresses the first, a required-fields instruction addresses the second — and the
headline rate collapses them.

Built in the **same pass** as the rates, from the same `verdicts`, deliberately: a second
implementation of "was this field right" is a second chance to disagree with the number it
explains, and the failure would read plausibly.

### The probe that removed a guard

The first draft had three guards preventing a scored-`null` field from being reported as a
miss, with a comment asserting all three were reachable through different inputs. That
comment was wrong, and it was wrong in the way the codebase already warns about: a
documented unreachable branch reads as protection.

The counter-example is one line of `scoreField`:

```ts
if (expected === undefined) {
  return null;   // not false
}
```

A field the ground truth never asked about is `null`, never `false`. So `fields[field] ===
false` implies an expectation exists, the third guard could never fire, and it was removed
rather than kept-and-documented. Verified by probe, not by reading: a sample with no
`description` expectation, paired with a prediction that also omits it and gets the other
three fields wrong, reports exactly three misses and `description: graded 0/0 (n/a)`. The
third guard never ran.

Removing it took `extraction-scoring.ts` from `99.27 | 98.21` to `100 | 99.11`, and the
remaining branch was a formatting ternary that a format test now pins.

### The guard that stayed, and why the difference is not cosmetic

The loop's other guard — `if (sample === undefined || prediction?.extracted === undefined)
continue` — was also unreachable, and it *did* have to go, but for a different reason and
by a different repair. Its second clause was doing real work for the type checker, which
cannot see that a `graded` verdict implies a present `extracted`. Deleting it produced
`TS18048: 'prediction.extracted' is possibly 'undefined'`.

The repair was to make the pairing structural rather than to re-add the guard: `paired`
now carries `{ sample, prediction, verdict }` from the single place they are already
together, and `gradedPairs` narrows `extracted` once with a stated invariant. The lookup
that could not be proven total is gone; the branch is gone; the type checker is satisfied.

## Finding 66: equivalent mutants have to be re-proven after the code they describe changes

`for (const verdict of graded)` versus `for (const verdict of verdicts)` in the diagnosis
loop is an equivalent mutant — both give identical output — and it survived injection twice.
The first time it was documented as equivalent on the reasoning that ungraded verdicts carry
all-null fields. That reasoning was correct, and the test suite did not check it.

The repair is not a new test for the mutant, which cannot be killed, but a test for the
**invariant the equivalence depends on**: every ungraded verdict carries all-null fields.
`leaves every ungraded verdict with all-null fields, which is what makes graded == verdicts`
asserts it for all three ungraded states, and now a mutation that gives `unvalidated` a
scored field fails with `unvalidated is ungraded but carries scored misses: [["type",false]]`.

Writing that test surfaced a **second** bug in the first draft of the fixture: the
`unvalidated` case was built as `{ parseOk: true, validationValid: false }` with no
`extracted`, which hits the `!parseOk || extracted === undefined` branch and lands in
`unparseable`. The fixture was not exercising the state it was named for, and a mutation
aimed at `unvalidated` survived *because the state was never reached*. The test now asserts
each fixture reaches its named state, so this cannot recur silently.

## Finding 67: a character-truncated annotation can cut an expected value in half

The miss-detail annotation was bounded with `cut -c1-900`. Measured against the real
scorer at 19 samples × 3 scored fields, the payload is **4044 characters**, and the worst
case ends mid-token:

```
...network-loss-payment-gateway.type:network-loss>wrong network-
```

That is half an expected value. A reader cannot tell a truncated value from a wrong one,
which is exactly the failure the surrounding comment claimed to be avoiding — the comment
said "a silently truncated line is worse than a stated bound" while the implementation
produced one.

Two errors compounded. The bound was a guess (900) never compared against the data, and it
cut on characters when the unit that matters is the row. The repair takes whole rows and
states the omission:

```
detail=$(printf '%s' "$missed_rows" | head -n 60 | tr '\n' ' ')
dropped=$((miss_row_count > 60 ? miss_row_count - 60 : 0))
```

The cap of 60 is measured: 19 samples × 3 fields = 57 rows maximum, 4091 characters
saturated, 64KiB annotation limit. So the truncation branch exists for a larger dataset and
is not the normal case. A test asserts the cap is at least 57 — and fails with
`the workflow caps detail at 10 rows but a fully-missed run produces 57` when it is not.

## Finding 68: a test helper that assumes a delimiter manufactured a green

The workflow test's `classificationAndDetail()` built its detail regex with
`detail.replace(/^s\//, '')`, assuming `/` was the `sed` delimiter. The detail substitution
uses `|`, because its *replacement* contains a `/`. So the strip matched nothing, the `|p`
suffix stayed on the pattern, and the resulting regex — `s|^    ([a-z]...)` — matched
**every** line.

Three negative assertions failed, which is how it was caught. But the two *positive*
assertions had been passing for the wrong reason: they matched on the stray `s|` prefix at
any offset, not on a real row. A helper that guesses a delimiter can therefore not merely
miss a defect, it can **manufacture** a passing test.

The repair reuses the delimiter-aware scanner the sibling helper already had — reading the
delimiter from the expression rather than assuming it, and splitting by scanning rather than
by a constructed `RegExp`. The same class of error had already been fixed once in this file
for `headlineSubstitutions()`; the fix was not carried across, which is finding 47's shape
again: a lesson recorded in one place and not applied in the next.

## The retraction

The previous round's closing recommendation was **"change the model, not the prompt"**,
with the argument that ~58% `category` consistency across providers would prove a capability
ceiling. That recommendation was challenged — *"why do you need another LLM?"* — and the
challenge was correct.

The reasoning had a break at one step. From "specification does not explain `category`'s
42%" it concluded "specification is unlikely to explain `type`'s 26.3%". But **what
`category`'s 42% actually is was never established.** A wrong in-vocabulary label and a
rejected out-of-vocabulary synonym are different failures with different owners, and the
second would have been *this scorer's parser* charging the model. Proposing a provider swap
on top of an unmeasured 42% was building on an inference presented as a result.

Two things then settled it without a run:

1. **A logical fact.** `parseFaultExtractionResponse({category: 'net'})` returns
   `{"ok":false,"error":"invalid fault category 'net'"}` — an out-of-vocabulary category
   makes the **whole response** unparseable. Since `graded` is 19/19, no sample can have
   answered a category outside the vocabulary, in any run, for any model. The
   "parser rejected a synonym" class is foreclosed, not merely unlikely.
2. **The answers were already on disk.** `derive-fault-golden.mjs` had been writing every
   prediction's fields all along.

So the provider question was not wrong because providers are irrelevant; it was wrong
because it was **ordered after a reading that cost nothing**. The correct sequence is: read
the answers, classify the misses, and only then ask whether the residual is capability. That
is what findings 65–68 implement, and the provider experiment stays available — now with a
measured baseline to compare against instead of an inferred one.

---

## Finding 69: the diagnosis answers it in one reading, and the answer invalidates finding 62

Run `36240660455` (`9932e766c`), first run carrying the miss diagnosis:

```
samples=19 graded_count=19 graded_rate=19/19 (100.0%) strict=0/19 (0.0%) m1=NOT MET (>= 70% strict)
type=4/19 category=11/19 component=4/19 description=0/0
classification=wrong value 38, omitted 0, samples with >= 1 miss 19
```

Three facts, each of which removes a class of explanation.

### `omitted 0` — the model never declines to answer

All 38 misses are answers that differ from the ground truth. Not one is a missing
field. "The model is not answering" and "the required-fields instruction is missing" are
both eliminated, and the earlier plan to address omissions would have been work on a
failure that does not occur.

### Every wrong `category` is a legal vocabulary value

Eight `category` misses. Checked mechanically against `FAULT_CATEGORIES`:

| expected | actual | legal? |
|---|---|---|
| `resource` | `code` | yes |
| `runtime` | `resource` | yes |
| `runtime` | `dependency` | yes |
| `middleware` | `resource` | yes |
| `middleware` | `code` | yes |
| `middleware` | `resource` | yes |
| `code` | `config` | yes |
| `middleware` | `resource` | yes |

**8 of 8 are inside the closed list. 0 are outside.** The model read the vocabulary
correctly and chose a different member of it.

This is the fact four rounds of reasoning were missing, and it **invalidates finding 62**.
Finding 62 argued that `type`'s low score was a *specification* defect and that `category`'s
57.9% was the visible cost of a well-specified field — so the fix was to specify `type`
better. That conflated two different failures:

- **formatting** — the model does not know what shape a value should take. Fixable with a
  grammar, a vocabulary, an example.
- **choosing** — the model knows the shape and picks the wrong member. Not fixable by any
  prompt that describes the output space, because the output space was already correct.

`category` was already in the second category and I read it as evidence about the first.
Its 57.9% is not "a well-specified field far from 100%" — it is **a semantic
disagreement rate**, and it is the natural ceiling for any field where the label depends
on a judgement call about the incident rather than on a fact in it.

The practical consequence: **finding 63's shape rule was aimed at the wrong failure mode.**
It was not wrong to state the grammar — a stated shape is a precondition, not a fix — but
the predicted jump it was measured against assumed a formatting problem. It bought one
sample because the actual problem is elsewhere.

### `component` is being answered by quotation

The `component` misses show a distinct and nameable behaviour: the model quotes the
incident text instead of naming the component.

| expected | actual |
|---|---|
| `session-cache` | `session Redis` |
| `billing-service` | `billing service database client pool` |
| `analytics-replica` | `replica applier thread` |
| `log-collector` | `log-collector-data-volume` |
| `media-transcoder` | `ffmpeg native binding` |
| `payment-gateway` | `client node egress interface` |

Where finding 61 measured that 5 of 19 expected components never appear in the text in any
form, this shows the complementary failure: the model **finds a phrase in the text and
returns it**, because the field is named `component` and no instruction says the answer must
be a component *identifier* rather than a component *description*. That is a formatting
defect in the strict sense — and unlike `category`, it is fixable, because the expected
values are identifiers and the instruction to give identifiers is absent rather than
contradicted.

### What this says about the remaining gap

`strict` needs 13 of 19 samples fully correct. With `type` at 4/19 and `component` at 4/19
against a 14/19 structural ceiling on `component`, no prompt change reaches 70%. The
honest statement of M1's position is: **the task, as specified by this golden set with this
model, is not reachable by prompt engineering**, and the two candidate paths are now
distinguishable rather than a matter of opinion — either the ground truth labels are
tightened to admit the model's defensible readings (a data change, and possibly a
*correct* one), or a stronger model is tried (the experiment deferred in Pass 19, now with
a measured baseline: `category` 8/8 legal-but-different is a claim a provider comparison
can actually test).

## Finding 70: the annotation format was ambiguous, and I misread it first

The first parse of the detail annotation reported **two rows where expected equalled
actual** — `order-service -> order-service` and `tax-calculation -> tax-calculation` — which
would have meant the scorer scoring a correct answer as wrong. It did not.

The rows are space-joined, and the *values contain spaces*. `order-service` was the first
token of the real answer `order-service ConfigMap`; `tax-calculation` the first token of
`tax-calculation provider`. Tokenising on whitespace split records and produced two
phantom contradictions.

The scorer was correct throughout, and the diagnostic channel was not: **a separator that
appears inside the data cannot separate the data.** This is finding 59's complaint about
`strict=0/19` being unactionable, one level down — the reading exists, is correct, and is
still capable of being misread, which for a measurement channel is the same defect.

The repair: emit the detail with a **record separator that cannot occur in a value**.
Values are derived from incident text and slugs, so `\x1f` (unit separator) is safe and
conventional; a newline would work too but is harder to keep out of a shell pipeline. The
annotation then states its own record boundary, and a reader does not have to infer it from
the shape of the payload.

## Finding 71: the separator fix, and the two numbers that prove it

Finding 70's repair is one line, so it is worth recording exactly what the line is worth,
because "we changed the separator" is not evidence and this project's standard is that a
change carries its measurement.

Two runs over the same saturated payload — 19 samples, 3 scored fields, 57 rows, wrong
values deliberately containing spaces:

| channel | records recovered | tokens if split on whitespace | rows as published |
| --- | --- | --- | --- |
| space join (before) | ambiguous | 285 | 57 joined into one run |
| `\x1f` join (after) | **57** | 57 | 57, each intact |

**57 rows produce 285 whitespace tokens** — a 5x over-split. That ratio is the ambiguity,
quantified: roughly four of every five "records" a whitespace-splitting reader would see
are not records. Finding 70's two phantom rows were the visible tip of it.

The saturated payload is 5306 characters (the earlier 4044 figure used a shorter wrong
value and was an underestimate of the worst case, not a different measurement), and the
cap is 60 rows, so `\x1f` costs nothing in length and the payload sits far inside the 64KiB
annotation limit.

### What the test asserts, and why not the literal byte

Three injections, all caught:

| injection | change | tests failed |
| --- | --- | --- |
| L | join with a space again | 3 |
| M | separator is `,` (printable) | 3 |
| N | raise the cap to 1000 | 1 |

Injection N failing only one test is correct rather than weak: the cap has two bounds in
opposite directions — too small truncates a routine run, too large overflows the
annotation — and they belong to two different tests. N violates the second
(`expected 116200 to be less than 65535`), not the first.

The test does **not** assert the literal `\x1f`. It reads the byte out of the workflow's
own `printf`, asserts it is a control character, and then asserts that **no value in the
real dataset contains it**. Pinning the literal would pass forever while the dataset grew a
sample whose value happened to contain the chosen byte; asserting the property catches
that on the commit that introduces it. This is the same reasoning as finding 66: assert the
invariant the choice depends on, not the choice.

## Finding 72: the separator, confirmed on live data -- and the ambiguity was 1.79x

Finding 71 proved the separator on a synthetic saturated payload. The workflow has now run with
it: run **36242319547** on `567118aea`, `success`, and the published annotation is readable as
records for the first time.

```
records: 39            (39 rows, cap of 60 not reached)
tokens if split on whitespace: 70
records containing a space: 15 of 39
```

**Fifteen of thirty-nine records contain a space**, so the old space join would have shown
**70 whitespace tokens for 39 records** -- a 1.79x over-split, measured on the real payload
rather than the synthetic one. Every one of those fifteen rows would have been silently
fragmented, and a reader reconciling tokens against the `samples with >= 1 miss 19` count
would have had no way to tell.

And the phantom mechanism is right there in the data. Two of the fifteen are:

```
config-datasource-url-orders.component:order-service>order-service ConfigMap
dependency-upstream-5xx-pricing.component:tax-calculation>tax-calculation provider
```

These are exactly the two rows that produced finding 70's apparent `order-service -> order-service`.
The scorer was never wrong. Under a whitespace split both rows begin with a token that repeats
the sample's own component name, which reads as "the model answered correctly and the scorer
marked it wrong" -- the most alarming possible misreading of a diagnostic, produced by a
separator choice.

### The reading this run produced

```
samples=19 graded_count=19 graded_rate=19/19 (100.0%) strict=0/19 (0.0%) m1=NOT MET (>= 70% strict)
type=5/19 category=11/19 component=2/19 description=0/0
classification=wrong value 39, omitted 0, samples with >= 1 miss 19
```

`component` moved 4 -> 2, and the detail says why. **Every one of the fifteen component rows is
a description, not an identifier** -- `session Redis`, `replica applier thread`, `native ffmpeg
binding`, `rack switch carrying the third node`, `scheduled job flag definition`. This is
finding 69's third fact confirmed on independent data, and the mechanism is now visible in
full rather than inferred from four examples: the model locates the passage that discusses the
component and returns a phrase from it, every time.

`omitted 0` again, on a second run. The model does not decline; it answers, and the answers are
descriptions where identifiers were wanted. That is a formatting defect with a named fix, and
it is the only one of the three fields for which that is true.

## Finding 73: the component hypothesis is refuted before it is implemented

Finding 72 ended with a named lever: `component` is answered with a description where an
identifier was wanted, so instruct the model to return the identifier. That reading is
correct and the proposed fix is wrong, and the arithmetic says so before any prompt is edited.

Applying the *actual* normaliser (`normalizeFaultType`: lower-case, whitespace and underscores
to hyphens, strip non-alphanumerics) to all fifteen wrong answers:

```
sample                                   expected             model answered                        slug(answered)                       match
resource-memory-leak-recommendation      recommendation-service  recommendation service session cache  recommendation-service-session-cache  no
resource-disk-full-log-collector         log-collector        log collector pod                     log-collector-pod                     no
network-delay-cart-to-inventory          cart-service         cart-to-inventory network path        cart-to-inventory-network-path        no
network-loss-payment-gateway             payment-gateway      client node egress interface          client-node-egress-interface          no
network-partition-search-cluster         search-cluster       rack switch carrying the third node   rack-switch-carrying-the-third-node   no
runtime-container-crash-loop-media       media-transcoder     native ffmpeg binding                 native-ffmpeg-binding                 no
middleware-redis-latency-cache           session-cache        session Redis                         session-redis                         no
middleware-database-connection-pool      billing-service      billing service connection pool       billing-service-connection-pool      no
code-unhandled-exception-export          export-worker        CSV writer                            csv-writer                            no
code-slow-regex-api-gateway              api-gateway          WAF rule                              waf-rule                              no
config-datasource-url-orders             order-service        order-service ConfigMap               order-service-configmap               no
config-feature-flag-checkout             checkout-ui          scheduled job flag definition         scheduled-job-flag-definition         no
dependency-upstream-5xx-pricing          tax-calculation      tax-calculation provider              tax-calculation-provider              no
dependency-version-incompatibility-shipping  shipping-service  client library                        client-library                        no
middleware-mysql-replica-lag-analytics   analytics-replica    replica applier thread                replica-applier-thread                no

slugifying the answer produces the expected: 0 of 15
```

**Zero of fifteen.** If the failure were formatting, this column would be mostly `YES`: the
answer would be the right words in the wrong shape. It is not. The answers are *different
entities*:

| expected (component identity) | answered (mechanism or location) |
| --- | --- |
| `media-transcoder` | `native ffmpeg binding` |
| `export-worker` | `CSV writer` |
| `api-gateway` | `WAF rule` |
| `session-cache` | `session Redis` |
| `payment-gateway` | `client node egress interface` |

A shape rule would therefore produce **well-formatted wrong answers**. `component` would score
0/19 in the same way it scores 2/19 now, with the added cost of having made the prompt longer
and the failure harder to see. This is the trap finding 62 named for `type` -- a rule that
describes the format of an answer the model is not giving -- and it applies more sharply here,
because the model is not even in the neighbourhood.

### What the failure actually is

The model is answering "what is involved in this incident", where the ground truth asks "which
component is faulty". Those are different questions, and the second one is not answerable by
reading the text: only **5 of 19** expected components appear verbatim in their incident text,
so the identifier must be *synthesised* from the expectation that the incident is about a
named service. `recommendation-service` appears as "the recommendation service"; the model
returns `recommendation service session cache`, which names the right service **and** its
cache. It is not a near miss on formatting, it is a different granularity.

### What follows for the design

The lever is not the prompt. Two honest options remain, and they are now sharply distinguished:

1. **The ground truth is the thing under test.** The model's answers are defensible readings of
   the same incidents (`session Redis` for a Redis-cache sample is not wrong). If the golden
   labels were tightened to admit the model's granularity, `component` would move -- and the
   change would be a *data* change whose correctness is independently arguable, not a prompt
   tweak tuned until a number rises.
2. **The field is over-specified for the task.** `component` at 2/19 with a uniform,
   100%-description failure is evidence that "the component" is not recoverable from these
   texts by this task framing, and the field's weight in `strict` should be reconsidered.

Both are decisions about what is being measured. Neither is reachable by editing the prompt,
and finding 73 exists so that the next pass does not spend a run discovering that.

## Finding 74: the instrument is stable, so the moving rate is the model's

Four runs produced `strict` 0 -> 1 -> 0 and `type` 5 -> 6 -> 4 on an identical dataset, an
identical prompt and a nominally identical model. The available reading was "the model is
noisy". That is a claim *about the model*, and it is only available if the instrument is
stable -- and the instrument had never been tested for stability over the real data. Every
existing scoring test graded hand-written fixtures.

Four properties, now asserted over the real 19-sample dataset rather than a fixture:

| property | why a violation would be invisible |
| --- | --- |
| **Determinism** -- two calls give byte-identical reports | a non-deterministic scorer makes every rate a sample, and a sample is indistinguishable from a measurement in the published number |
| **Input purity** -- the scorer does not mutate the dataset | a second run would differ from the first for a reason unrelated to the model |
| **Order independence** -- reversing the predictions changes nothing | positional pairing would score every sample against the wrong ground truth, and a re-sorted file would read as a model change |
| **Denominator completeness** -- `samplesWithMisses` equals the graded samples with a miss, and `wrongValue + omitted` equals the detail rows | the two published lines could disagree while each looked self-consistent |

All four hold. `strict`'s 0 -> 1 -> 0 is therefore **model sampling, not measurement drift** --
which is a negative result and the useful one: it means M1's instability across runs is a fact
about the model's output distribution, and a single run cannot be read as a capability
estimate. That is the justification for treating `component` 4 -> 2 the same way rather than
as a regression.

### The battery found a defect in itself first

Injection A (embed a per-call counter) initially reported **SURVIVED**. It had not survived --
the injection's second anchor did not match the real `return {` shape, so the mutation was
never applied and the test suite correctly reported nothing. An inert injection and a toothless
test produce the *same* output: `SURVIVED`.

That is the same class of defect as finding 68's manufactured green -- a signal that reads as
a substantive conclusion while being an artefact of the instrument. The repair is that the
battery now distinguishes three outcomes and fails on the two that are not `CAUGHT`:

```
CAUGHT  A. non-deterministic: embed a per-call counter in the report  (failed 2, passed 14)
CAUGHT  B. mutates its input: sorts the samples in place              (failed 2, passed 14)
CAUGHT  C. pairs by position instead of by id                         (failed 1, passed 15)
CAUGHT  D. drops the denominator: omits a sample that missed          (failed 1, passed 0)
battery: 4 caught, 0 survived, 0 inert
```

`INERT` is counted separately and non-zero exits non-zero, because "the mutation never
happened" must not be reportable as "the test caught it" or as "the test missed it".


## Finding 75 -- The `component` rule rejects exactly one sample, and that sample is mislabelled

Finding 73 established that `component`'s fifteen wrong answers are *different entities*, so no
shape rule rescues them. Finding 74 established that the instrument is stable, so the field's
readings are real. What neither settles is the prior question: **what is `component` a component
of, and what rule makes a given answer right or wrong?** Without a stated rule the field is
ungradeable in principle -- every answer is wrong for an unstated reason, which is
indistinguishable from the grader being wrong.

The cheapest way to find the rule is to look for the one that the ground truth *itself* obeys,
since a ground truth that violates its own rule is a data defect rather than a model failure.
Three candidates, measured over all 19 expected values:

| candidate rule | coverage | verdict |
| --- | --- | --- |
| appears verbatim in the incident text | **5/19** | useless: the identifier must usually be *synthesised* |
| verbatim, or with hyphens read as spaces | **13/19** | still rejects six legitimate names |
| every hyphen token of the name appears in the text, case-insensitively | **18/19** | rejects **exactly one** |

The third rule is the only one that nearly works, and the single sample it rejects is worth
reading in full:

```
id:       config-feature-flag-checkout
expected: checkout-ui

The one-click checkout button disappeared from the storefront for all users at 08:00.
No deploy ran. The flag service shows flag 'one_click_checkout' flipped to false at 07:59
by a scheduled job that was supposed to flip a different flag; a copy-paste left the same
key in both job definitions.
```

**The string `checkout-ui` does not appear, and no part of it can be derived from the text.**
Every other expected component shares at least one token with its incident, which is why the
token rule reaches 18/19 -- the six the space rule loses (`cart-service`, `session-cache`,
`order-events-consumer`, `api-gateway`, `analytics-replica`) all keep their tokens
(`cart`, `session`, `events`, `gateway`, `analytics`, `replica`) and only re-join them. This
sample is the sole one where the ground truth is **not recoverable from the input at all**:

- the failing subject is "the one-click checkout button" -- a UI element, never named as a service;
- `checkout-ui` is a naming inference, not a reading;
- the sample is bucketed under `category: config`, yet its mechanism is a *scheduled job*
  flipping a flag, which is the same mechanism as `runtime-pod-kill-user-profile` -- whose
  expected component is likewise a workload name.

So `checkout-ui` is either an annotation error, or the benchmark relies on a naming convention
it never states. Either way it is a **defect in the ground truth, not a model failure** -- and it
is the one sample that makes the `component` rule unwritable.

### The rule must not be written by watching the model

The obvious failure mode is to pick whichever rule flatters the current answers. Measured, the
fifteen wrong answers under the token rule:

| how many wrong answers satisfy it | count |
| --- | --- |
| verbatim in the text | **7/15** |
| all words present | **10/15** |

A rule that **10 of the 15 wrong answers satisfy** cannot distinguish right from wrong -- and the
seven that are verbatim are verbatim for the *wrong reason*, which is the sharper result:

| sample | model answer | what it actually named |
| --- | --- | --- |
| `middleware-redis-latency-cache` | `session Redis` | the datastore instance, not the service |
| `code-unhandled-exception-export` | `CSV writer` | a code symbol inside the faulting worker |
| `code-slow-regex-api-gateway` | `WAF rule` | the *cause*, not the component |
| `dependency-upstream-5xx-pricing` | `tax-calculation provider` | the upstream dependency, not the owner |
| `config-datasource-url-orders` | `order-service ConfigMap` | the config object, not the service |

Every one of these names something **real and present in the text**, one level off from what the
field asks for. That is the same failure as `type`'s: the model answers a nearby question
correctly. A prompt that merely asks for "the faulty component" leaves the level unstated, so
the answers are not wrong so much as **un-asked** -- and this is a defect in the *task
definition*, not in the model and not in the prompt's wording.

### Consequence: `component` cannot be fixed by a prompt edit, and must not be fixed by editing the ground truth

Two temptations, both refused on the evidence:

1. **Editing the prompt to say "name the service, not the object"** -- rejected by the above. Ten
   of fifteen wrong answers already satisfy the loosest textual rule, so a wording change cannot
   be validated: any improvement would be indistinguishable from sampling noise (finding 74
   showed `component` moves 4 <-> 2 across runs). The change would be unfalsifiable.
2. **Editing `checkout-ui` to something derivable** -- rejected because the sample is evidence of
   a real ambiguity in the benchmark's own definition, and editing it away destroys that
   evidence while leaving the definition unwritten. The fix is to state the rule and then let
   the sample be re-annotated *by the rule*, in a commit that can show the rule's own tests.

The decision this leaves is a **data/design** one, and it is the round's open question: the
benchmark must state what a component answer denotes (the deployed workload that owns the fault,
on the evidence of the three well-formed samples `checkout-api`, `user-profile`,
`media-transcoder`), after which the rule becomes testable, `checkout-ui` becomes either
re-annotated or a named exception, and `component`'s rate becomes a capability estimate rather
than a reading.


## Finding 76 -- The `component` rule has discriminating power, which makes a prompt edit unfalsifiable rather than useless

Finding 75 argued that the token rule cannot distinguish right from wrong, on the strength of
"ten of fifteen wrong answers satisfy it". Writing that rule as an executable test and running it
against the recorded run -- four right answers and fifteen wrong ones -- **falsified the claim's
strength while confirming its conclusion**. The measurements, in the test that now pins them:

| side of the run | answers | accepted by the token rule | rate |
| --- | --- | --- | --- |
| correct | 4 | 4 | **1.00** |
| wrong | 15 | 11 | **0.73** |

So the rule **does** discriminate: it accepts every right answer and rejects four of the fifteen
wrong ones. Finding 75's sentence "a rule that 10 of the 15 wrong answers satisfy cannot
distinguish right from wrong" was an overstatement -- a 73% acceptance rate over wrong answers is
not zero discrimination, and the correct statement of the defect is different and sharper.

**The defect is not that the rule cannot tell right from wrong. It is that the gap is small enough
to be closed by a prompt edit without any change in capability.** A prompt that pushed the
answers toward text-present vocabulary would raise the acceptance rate on the wrong side toward
1.00 -- the *measured* rate would improve while the *number of correct answers* stayed at four.
That is the unfalsifiability finding 75 names, and it survives the correction: the argument never
needed the rule to be useless, only for its acceptance rate to be uncorrelated with correctness
in the direction a measured rate would move. The correction makes the argument stronger, because
"the metric can be gamed upward" is a more specific failure than "the metric is noise".

### The rule is looser than "the answer appears in the text"

Finding 75 said the accepted answers "name something real and present in the text". Measured, the
relation is looser than that: of the eleven accepted wrong answers, **exactly one** is a case
where the ground-truth component itself appears verbatim. The other ten are accepted on **token
co-occurrence alone** -- the answer's words appear, but the ground-truth component does not:

| sample | expected component | accepted answer | why it passes |
| --- | --- | --- | --- |
| `dependency-upstream-5xx-pricing` | `tax-calculation` | `tax-calculation provider` | the component appears; the answer over-qualifies it |
| `middleware-kafka-consumer-lag` | `order-events-consumer` | `order-events` | `order` and `events` occur; the answer truncates |
| `dependency-version-incompatibility-shipping` | `shipping-service` | `client library` | neither is the component; both occur in the text |
| `network-loss-payment-gateway` | `payment-gateway` | `client node egress interface` | names the failing path, not the owner |
| `code-null-dereference-reporting` | `reporting-service` | `summarize()` | names the function the trace ends in |
| `config-feature-flag-checkout` | `checkout-ui` | `scheduled job flag definition` | names the mechanism, not the subject |

The first row is the single most informative datum in the round. `tax-calculation` is **readable
verbatim** from its incident -- the sample where the model had the answer in front of it -- and it
still answered `tax-calculation provider`. The readable set is five samples; the correctly
answered set is four; and the single member of the difference is the sample where the model read
the right entity and then named it one level off. That is the failure mode in its purest form,
and it is now an assertion rather than an anecdote.

This also corrects finding 75's framing of the accepted answers as "a real object one level off".
Ten of the eleven are not one level off from the component; they are **on a different axis** --
the mechanism, the path, the datastore, the symbol, the config object. The model is not
mis-levelling a name, it is answering a different question, which is what finding 73 found at the
entity level and this finding confirms at the rule level.

### The assertions were rewritten three times, each time because the battery reported SURVIVED

The battery is the reason the conclusion is trustworthy, so its own history is part of the
evidence:

| version | assertion | mutation that survived it |
| --- | --- | --- |
| 1 | `expect(WRONG[id]).toBe('session Redis')` | any -- it compared a literal to itself |
| 2 | `expect(satisfied.length).toBeGreaterThanOrEqual(10)` | widening the bound to `0` |
| 3 | `expect(wrongRate).toBeGreaterThan(0.5)` plus `expect(wrongRate).toBeLessThan(rightRate)` | **none: 8 caught, 0 survived, 0 inert** |

Version 1 was a tautology over a literal declared three lines above it. Version 2 tested the
"majority" claim only at its own boundary, so no mutation inside the range moved it. Version 3
asserts a **contrast** -- a rate over wrong answers against a rate over right answers -- which
can fail in both directions and therefore moves when either side changes. The rewrite was not
driven by reading the code for weakness; it was driven by eight injections, one of which
reported `SURVIVED` after every honest attempt to make it fail.

One further correction came from the same source. An intermediate version asserted that the
readable-and-wrong set and the accepted-and-wrong set were the **same** set; measuring showed
eight accepted wrong answers are not readable at all, so the bijection was false. The honest
statement is a set difference with a named count, which is what the test now asserts -- and the
injection that closes the gap in the wrong direction is caught.

### Consequence for the round's open decision

Nothing in this finding changes the recommendation, but it changes what the recommendation rests
on. The benchmark still needs a **stated** rule for what a `component` answer denotes, and the
evidence for it is now: three samples whose answer is the deployed workload named verbatim
(`checkout-api`, `user-profile`, `media-transcoder`), four answered correctly under exactly that
reading, and one sample (`config-feature-flag-checkout` / `checkout-ui`) whose ground truth is not
recoverable from its text at all. What is newly excluded is the *reason* a prompt edit is refused:
not because the rule is meaningless, but because a rule with a 73% acceptance rate on wrong
answers cannot be validated by its own rate.


## Finding 77 -- The battery that catches false readings shipped with a false reading of its own, and the CI run is what caught it

`3a04d26` pushed twelve gates and two injection batteries. Eleven passed locally and in CI.
The twelfth -- the scorer-stability battery, the very step that exists to prove the other gates
mean something -- **failed in CI on its first run and passed locally every time**.

The job step list, read through the API because the log channel is unreachable:

```
9   Test with coverage (core + cli, ≥95% per dimension, 100% functions)   success
10  Mutation suite (gate + export, 100% interception)                     success
11  Scorer stability battery (no survivors, no inert mutations)           failure  <== FAILED
12  Golden Master verification                                             skipped
```

The cause was three lines at the top of `scripts/inject-stability.mjs`:

```js
const SRC  = '/root/.codebuddy/artifact/rca-work/rca-bench-factory/packages/core/src/fault/extraction-scoring.ts';
const BAK  = '/tmp/extraction-scoring.bak.ts';
const REPO = '/root/.codebuddy/artifact/rca-work/rca-bench-factory';
```

**The absolute path of the machine it was written on.** On the runner there is no such
directory, so `copyFileSync` threw before the first injection and the step exited non-zero. The
failure was total and silent: no injection ran, so the output said nothing about the scorer, and
a reader who saw only "battery failed" could have concluded the *tests* were weak when in fact
the battery never started.

### Why this is worse than an ordinary bug

The repository's stated standard is that a pre-push gate makes local-pass/CI-fail drift
impossible. This defect inverted it: **the script whose purpose is detecting work that only
appears to pass was itself work that only appeared to pass.** It is finding 68's manufactured
green in the most load-bearing place available -- not in a test, and not in a battery, but in the
battery's own entry path. Three properties made it invisible:

| property | why it hid the defect |
| --- | --- |
| the path was correct on the author's machine | every local run passed, including the run that produced finding 76's eight-caught result |
| the failure mode was an exception before any output | the console showed nothing that distinguished "did not start" from "found nothing" |
| the sibling script got it right | `verify-scorer-stability.mjs` resolves from `import.meta.url`, so a reader comparing the two would see one correct example and one correct-in-appearance example |

### The fix, and the gate that prevents a repeat

Paths now resolve from the script's own location, and the backup lives inside the repository
rather than in a shared temp directory:

```js
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SRC  = resolve(REPO, 'packages/core/src/fault/extraction-scoring.ts');
const BAK  = resolve(REPO, 'node_modules/.cache/extraction-scoring.bak.ts');
```

Repairing the three lines is not sufficient, because the next script can make the same mistake.
A static check was added and wired into the `lint` chain -- `scripts/check-no-absolute-paths.mjs`,
which fails on any string literal under `/Users`, `/home`, `/root` or `/private` in `scripts/`,
`packages/*/src` and `golden-master/`. It found **eight occurrences across five files**, three of
which predated this round:

| file | path | disposition |
| --- | --- | --- |
| `scripts/inject-stability.mjs` | the author's checkout | **the CI failure** -- fixed |
| `scripts/inject-component-rule.mjs` | a fixed `/tmp` report path | written this round, fixed before it could fail |
| `scripts/fetch-official.mjs` | `/tmp/official` output default | left: a portable fallback, and the rule was narrowed to say so |
| `scripts/injection/*.py` (3 files) | the author's checkout, `/tmp` backups | fixed: these are cited by `docs/audit.md` as historical evidence, so deleting them would destroy the record |

The check was then **verified to have teeth** by reintroducing the exact defect and confirming it
fails, then restoring and confirming it passes -- the same discipline this finding is about.

### Verification on a CI-shaped layout

Passing locally proves nothing about this class of defect, so the fix was verified in a directory
that is *not* the author's checkout:

```
$ cd /tmp/ci-sim2/work && node scripts/inject-stability.mjs
CAUGHT  A. non-deterministic: embed a per-call counter in the report  (failed 2, passed 14)
CAUGHT  B. mutates its input: sorts the samples in place              (failed 2, passed 14)
CAUGHT  C. pairs by position instead of by id                         (failed 1, passed 15)
CAUGHT  D. drops the denominator: omits a sample that missed          (failed 1, passed 0)
battery: 4 caught, 0 survived, 0 inert
EXIT=0

$ cd /tmp/ci-sim2/work && node scripts/inject-component-rule.mjs
battery: 8 caught, 0 survived, 0 inert
EXIT=0
```

Running `check-no-absolute-paths.mjs` in that same directory **also** reported the two `.py`
files, because the copy step had not yet picked up their fix -- an unplanned second demonstration
that the check detects the real defect rather than a pattern it was tuned to.

### What this changes about how the round is read

Finding 76's conclusion -- 8 caught, 0 survived, 0 inert -- was produced by a battery that could
not have run in CI. The *result* stands, because the injections did apply on the machine where it
ran and the mutations and catches are reproducible there; but the claim "this is a gate" was
false until this finding, since a gate that fails everywhere except one machine protects nothing.
The distinction is worth keeping explicit: the measurement was sound, and the enforcement was not.

## Finding 78 -- M1's ceiling is 18/19, and the *component* field costs exactly one sample of headroom

Every pass since 21 has closed on the same open question, stated identically each time: the benchmark
must *state* what a `component` answer denotes. Finding 75 declined to state it and gave a reason --
`checkout-ui` is not recoverable from its own incident text, so no rule describes the ground truth.
Finding 76 declined to state it too, and gave a different reason -- the loosest rule accepts 73% of
the wrong answers, so no prompt edit can be validated against it.

Both findings are about the *rule*. Neither answered the question the milestone is actually scored
on: **what is M1's ceiling, and what does the `component` field cost?** That is a measurement, not a
design debate, and it had never been taken.

### The measurement

`scripts/probe-m1-ceiling.mjs` computes it. Two definitions, reported side by side because a
"ceiling" quoted without its definition is the class of number this repository has retracted three
times:

```
component, under the loosest defensible rule (all hyphen tokens present):
  recoverable   18/19
  unrecoverable 1/19  [config-feature-flag-checkout]

M1 strict threshold: 0.7
strict, every stated field required:
  ceiling 18/19 = 94.7%  CLEARS M1
strict, component excluded from the definition:
  ceiling 19/19 = 100.0%  CLEARS M1

the decision costs 1 sample(s) of headroom: 18/19 strictly vs 19/19 without component.
```

### Why this contradicts what the documents said

`docs/audit.md` finding 69 states the opposite, in the present tense:

> `strict` needs 13 of 19 samples fully correct. With `type` at 4/19 and `component` at 4/19 against
> a **14/19 structural ceiling** on `component`, no prompt change reaches 70%.

Both halves of that sentence are wrong, and they are wrong in the same direction -- they make the
milestone look unreachable when it is reachable.

**The 14/19 figure was never measured.** It appears in the audit with no derivation, and the
arithmetic does not reproduce: 18 of 19 expected components are recoverable under the rule finding 75
itself names as the loosest defensible one. A ceiling of 14/19 implies five unrecoverable samples;
there is one. The likely origin is a count taken over a *stricter* rule and then quoted under this
one, which is the same defect as the `538` figure finding 54 retracted -- a number that outlived the
measurement it came from.

**"No prompt change reaches 70%" does not follow from the ceiling in any case.** The ceiling is a
bound on what the *ground truth* admits, not on what the *model* can achieve, and the two are
independent: a model that gets every recoverable field right scores 18/19 = 94.7%. The sentence
conflates "the benchmark cannot ask more than 18 questions" with "the benchmark cannot be passed",
which is the mistake a ceiling measurement exists to prevent.

### What is actually true

| claim | value | source |
| --- | --- | --- |
| expected components recoverable under the loosest rule | **18/19** | probe, and `fault-prompt-grammar.test.ts` |
| the one exception | `config-feature-flag-checkout` / `checkout-ui` | both |
| M1's strict ceiling, component required | **18/19 = 94.7%** | probe |
| M1's strict ceiling, component dropped | **19/19 = 100%** | probe |
| headroom the `component` decision costs | **1 sample** | probe |
| samples the model must get fully right to clear 70% | **14 of 19** | `M1_STRICT_THRESHOLD` |
| headroom above that requirement | **4 samples** | 18 - 14 |

So the position is: M1 needs 14 of 19 fully correct, the field structure permits 18, and the four
samples of slack are what the round has been spending. The `component` field -- the field two
findings were written about, the field a whole pass was spent making executable -- **costs one
sample of headroom out of four.**

### Consequence for the open decision

The decision is now an arithmetic one rather than a judgement call, and it inverts the priority the
last several passes assigned it.

**Stating the `component` rule recovers at most one sample.** Even the strongest version -- state the
rule, re-annotate `checkout-ui` by it, get the model to answer it -- moves the ceiling from 18/19 to
19/19. Against a 14-sample requirement that is a 7% increase in headroom, and it requires a dataset
edit, a prompt edit, a re-run, and a new finding for each.

**The binding constraint is `type`, and it is not a definitional problem.** Finding 69's `type` at
4/19 is a model-accuracy figure, not a ceiling: all 19 expected types are distinct slugs and
`normalizeFaultType` leaves each unchanged, so nothing about the *data* limits how many the model can
answer. The probe asserts exactly that distinction, and finding 62's prompt fix has already been
applied and measured without moving the number.

The honest statement of M1's position is therefore: **the benchmark can ask 18 questions, the model
answers 4 well enough to clear the bar, and closing that gap is a model capability question rather
than a `component` definition question.** The `component` rule should still be stated -- an unstated
rule makes the field ungradeable in principle and finding 75's argument for stating it stands -- but
it should be scheduled as one sample of cleanup, not carried as the milestone's blocker.

### Guards, because this number will be quoted

The probe's own tests (`packages/core/test/m1-ceiling-probe.test.ts`) compute the expected
recoverability **from the dataset** and require the probe to agree, rather than reading two numbers
out of the same report -- the battery showed that a test comparing the report to itself proves only
that the report is internally consistent. The probe partitions the ground truth into recoverable and
unrecoverable and *derives* the second list from the first, with a guard that fires when the two
disagree; the first draft computed them by two independent filters, and an injection that exempted
one sample from the positive filter left the negative one untouched, so the report held two
contradictory figures and nothing said which was right.

## Finding 79 -- Two batteries classified a suite that never ran as a suite nothing could break

Finding 78's probe needed assertions about its published figure, and this repository's standard for
anything that reports a number is a battery that requires each assertion to be breakable. The file
was written, it passed 8/8, and it was then driven through a battery of its own. **Seven of the
eight mutations survived.**

That is the finding: the tests were written and looked correct, and almost none of them could fail.

### The three defects, in the order the battery found them

**1. A relaxed assertion with no mutation to expose it.** Three injections changed the test file
alone -- relaxing an equality to a bound, dropping a named tripwire, replacing a derived value with a
literal. All three SURVIVED, and the survival was *correct*: with the probe publishing correct values,
nothing in the file could fail, because the relaxation was the only change. An injection that edits
only the assertion under test and leaves the subject correct is not a test of the assertion. Each was
re-paired with the probe mutation it exists to catch, and all three then failed.

**2. `-1 > 0` is false, so a broken runner read as a survivor.** `runSuite()` returns
`failed: -1` when the vitest process produces no JSON report -- which is what a mutation that crashes
the script under test looks like. The branch was:

```js
if (result.failed > 0) { CAUGHT } else { SURVIVED }
```

so a mutation that stopped the suite from running at all was classified SURVIVED and counted as an
assertion nothing could break. **The sibling battery in CI (`scripts/inject-component-rule.mjs`) has
the same branch, so this was a live defect in a gate, not only in the new file.** Both now read the
total test count: zero tests run is caught, not survived.

**3. Zero failures is also what a passing suite reports.** Fixing (2) exposed a second form of the
same ambiguity. Vitest writes `failed: 0, passed: 0` when the test file throws during *collection* --
the probe mutation that makes the script throw at module load is the case -- and with the fix above
in place that still read as a suite that ran and found nothing. The distinction that actually
separates the cases is `numTotalTests`, not either count, and it is what both batteries now use.

Three ways to write "did the suite fail", and only the third distinguishes a mutation nothing detects
from a mutation that broke the runner. This is finding 74's INERT/SURVIVED distinction in a second
place, arrived at the same way -- by a run whose output was ambiguous rather than wrong.

### The identity claim, and why its failure to be caught is *not* a defect

Injection B swaps which sample is unrecoverable (the count stays at one) and relaxes every assertion
about that identity. Four attempts were needed to make it caught, and the sequence is worth keeping
because it shows how easily a claim becomes unenforceable:

| attempt | relaxed | result | what it revealed |
| --- | --- | --- | --- |
| 1 | the named tripwire | SURVIVED | the partition test derives the set from the dataset independently |
| 2 | + the derived comparison | SURVIVED | the membership test still checked the length against the same derived count |
| 3 | + that length check | SURVIVED | nothing else pinned the identity |
| 4 | + the literal, replaced with a *contrast* | **CAUGHT** | naming the other end of the move gives the assertion a relationship to the data |

The lesson is attempt 4. A literal compared to a reported value can be relaxed into agreement, because
relaxing it changes only the relationship between two numbers that already agree. A contrast against
the sample the mutation moves *to* cannot: `expect(ids).not.toContain('network-delay-cart-to-inventory')`
plus the properties of that sample fails whichever direction the swap goes. This is finding 76's
conclusion -- an assertion that records a distribution fact has no structural consequence, so the
question is not "can it be deleted" but "does asserting the opposite direction fail" -- reached
independently in a different file.

A correction came out of attempt 4 as well. The contrast's first version asserted that the swap
target's text contains `cart-service` verbatim, and that is false: the incident says
"Cart-to-inventory" and "the inventory service", and the rule accepts the component because both of
its hyphen tokens occur, not because the joined name does. The assertion now pins the actual
mechanism -- both tokens present, the joined form absent -- which is the distinction the whole
`component` question turns on.

### A measurement taken while a battery was writing the source

One core coverage run reported `1 failed | 2444 passed`, and the rerun reported `2445 passed` with no
failure. The cause is operational rather than logical: the run was issued while an injection battery
was mid-flight, and a battery mutates `packages/core/src/fault/extraction-scoring.ts` and the golden
dataset on a timer. A test that reads a file the battery had temporarily rewritten is a test that can
fail for a reason that has nothing to do with the code. The gate chain runs the batteries in
sequence for this reason, and the lesson generalises: **two processes that both write the same source
tree must not run concurrently**, and a green suite is only evidence about the revision it was run
against.

### What this changes

The probe's figure from finding 78 stands -- it was measured by a script, before any of this, and the
battery's job was to check the assertions *about* it, not the figure. What changes is the confidence
in the guards: the tests now compute their expectations from the dataset rather than from the report,
the partition is derived rather than filtered twice, an injection that breaks the two halves apart
trips a guard, and a suite that will not run is counted as caught. All of those are recorded as
mutations, so the next edit to the file is checked rather than trusted.


## Finding 80 -- The `component` rule is statable, and stating it required re-annotating one sample

Finding 75 established that the `component` field was ungradeable in principle, found the token rule
the ground truth itself obeys, and measured it rejecting exactly one sample: `config-feature-flag-checkout`,
annotated `checkout-ui`. Finding 78 priced that sample at one of four samples of headroom and
scheduled the fix as cleanup rather than a milestone blocker. This round does the cleanup, and the
measurement that made it safe is the one worth recording.

### What the sample actually is

The hypothesis finding 75 left open was that the sample is *unrecoverable* -- that no name derivable
from its text could be the answer. That is true of `checkout-ui`, and false of the sample:

```
id:       config-feature-flag-checkout
expected: checkout-ui            <- the string does not appear in the text
text:     "...disappeared from the storefront for all users..."   <- storefront does
          "...The flag service shows flag 'one_click_checkout'..."<- flag service does
```

Measured over all 19 samples, this is the **only** annotation in the file whose name is absent from
its own incident text. Every other expected component shares at least one token with its text; this
one shared none, because it named a UI element inferred from the symptom rather than a workload read
from the incident.

So the finding is not "one sample is unrecoverable". It is **one sample was mis-annotated**, and the
text it was mis-annotated from names two deployed workloads. Re-annotating it to the workload whose
user-visible surface broke -- `storefront` -- closes the rule with no exception:

| reading | ceiling | headroom over the 14-sample requirement |
| --- | --- | --- |
| as shipped (`checkout-ui`) | 18/19 = 94.7% | 4 samples |
| re-annotated (`storefront`) | **19/19 = 100%** | **5 samples** |

### What the re-annotation cost, which is not nothing

Changing a ground-truth value moves every figure computed over it, and four of them moved:

| figure | before | after |
| --- | --- | --- |
| readable-verbatim set | 5 | **6** |
| readable-and-wrong | 1 | **2** |
| wrong answers accepted by the token rule | 10/15 (0.67) | **9/15 (0.60)** |
| accepted on token co-occurrence alone | 8 | **7** |
| strict ceiling | 18/19 | **19/19** |

The wrong-answer acceptance rate **fell**, which is the interesting part: the rule now accepts a
smaller share of the wrong answers. It remains above 0.5, so finding 75's argument -- that a rule
this permissive cannot grade the field, and a prompt edit toward it would be unfalsifiable -- still
holds. The movement is recorded rather than smoothed, because a rate quoted from a stale run would
be a false reading of exactly the kind this repository has retracted before.

### The rule that is now stated

`buildFaultExtractionPrompt` carries a `FAULT_COMPONENT_RULE` beside `FAULT_TYPE_SHAPE_RULE`, stating
the *level* (the deployed workload that owns the fault, not the config object, code symbol, upstream
dependency or UI element) and the *shape* (a lower-case hyphenated slug). The level is the
load-bearing half: all fifteen wrong answers from the recorded run are well-formed identifiers, so a
shape rule alone would not have changed a single one. What they got wrong was which entity they named.

The rule is a description of the data, not a new requirement -- the same contract `type`'s rule makes.
Both properties are asserted over the real file, so a dataset edit that breaks either fails a test
rather than silently invalidating the prompt text. Deliberately not a list of the 19 answers: the
prompt's examples (`payments-api`, `search-indexer`, `session-store`) are chosen to be unlike any
dataset component, and a test asserts none of the 19 appears in the prompt.

### The part that was nearly missed

**Four injections across two batteries went stale the moment the data moved, and none of them was a
probe or test defect.** They were the batteries mistaking the day's numbers for the invariant:

| injection | how it went stale |
| --- | --- |
| probe battery A, B | asserted `unrecoverable == 1` and `ceiling == 18`, which encoded the gap |
| probe battery C | anchored on `"checkout-ui"`, which no longer exists -- INERT |
| probe battery E | `strictCeiling = total` became a no-op once `recoverable.length == total` |
| probe battery J | exempting the re-annotated sample became a no-op for the same reason |
| test battery A, G | same `checkout-ui` exemption, applied-but-inert -- the worst kind |
| test battery H | anchored on `"checkout-ui"` -- INERT |

The fix is structural, and it is the finding: **every requirement in the probe battery now reads the
baseline the probe actually reports**, so it asserts a *movement* rather than a literal. A requirement
phrased as "the ceiling fell by one" survives a dataset edit that moves the ceiling; a requirement
phrased as "the ceiling is 18" turns into a false alarm. Two injections also had to be re-aimed at
what the closed ceiling can still distinguish, because a mutation that is a no-op under the new data
cannot be caught by any assertion -- E now drops a sample from the numerator, and J reproduces the
original two-independent-filters defect rather than a plausible-looking edit that still partitions.

### Verification

| gate | result |
| --- | --- |
| probe | 19/19, unrecoverable 0/19, headroom cost 0 samples |
| probe battery | **10 caught, 0 survived, 0 inert** |
| test battery | **8 caught, 0 survived, 0 inert** |
| component-rule battery | **8 caught, 0 survived, 0 inert** |
| stability battery | **4 caught, 0 survived, 0 inert** |
| core | 2623 passed (87 files), `src` 100 / 100 / 100 / 100 |
| cli | 173 passed |
| golden master | PASSED (6 OpenRCA + 4 RCAEval byte-stable) |
| official | PASSED (8 targets, 1 skipped by contract) |
| docs / examples / registry / bundle | up to date |

### What this changes for M1

**The benchmark can now ask 19 questions rather than 18, and the field's definition no longer costs
headroom.** The milestone's remaining gap is unchanged and is the one finding 78 identified: the model
answers few of those questions well enough to clear the bar, and `type` is the binding constraint with
no structural ceiling behind it. Stating the rule did not raise the measured accuracy on its own -- it
removed a reason the measurement could not be trusted.

## Finding 81 -- The `type` shortfall is a capability limit, and it drifts toward over-specification

Finding 69 classified `category`'s eight misses one by one -- `resource -> code`, `runtime -> resource`,
and so on -- and concluded that the model chose a legal vocabulary member, so the failure was *choosing*
rather than *formatting*. Finding 78 then argued `type` has no structural ceiling behind it and read its
4/19 as a model-accuracy figure. **Neither reading was a reading.** Finding 69's conclusion was taken
over `category` and *asserted* of `type`; finding 78 repeated the assertion. This round takes the
reading, and it is the same asymmetry finding 69 was written to close, one field over.

### The question, stated so it can be answered

When the model's `type` differs from the expected slug, is it

| class | what it means | whose defect |
| --- | --- | --- |
| `form-variant` | the answer normalizes equal to the expected slug | **this repository's** -- the scorer rejected an answer it should have accepted |
| `shares-token` | same subject, more words (`cpu-saturation` -> `cpu-throttling`) | the model's, and a near miss |
| `different-mechanism` | something else entirely (`network-loss` -> `egress-packet-drop`) | the model's |

The partition matters because the first class is actionable here and the other two are not. The
normalizer under test is `normalizeFaultType`, which is a pure **form** normalizer:

```ts
type.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')
```

It folds case, whitespace and separators. It **strips** rather than replaces punctuation, so
`null.dereference` becomes `nulldereference` and is *not* equal to `null-dereference`; a trailing hyphen
is **kept**, so `cpu-saturation-` is not equal either. It performs **no synonym resolution**. Both of
those distinctions were asserted wrongly in the first draft of the test file and are now pinned as the
negative half of a contrast, because they are the reason the recorded misses are not form variants.

### The reading

The fifteen `type` misses of run `9932e766c` are recorded in the CI annotation in `expected>actual`
form, e.g. `resource-cpu-saturation-checkout.type:cpu-saturation>cpu-throttling`. They are transcribed
into `scripts/probe-type-misses.mjs` with their run named:

```
form-variant 0 | shares-token 9 | different-mechanism 6
over-specified (answer longer than the expected slug): 11/15
no form variant: the normalizer is not the defect, so no answer here was rejected
that should have been accepted
```

**The first class is empty, and that is the load-bearing result.** Not one of the fifteen answers would
have been accepted by a correct normalizer. There is no scoring defect to fix, and no synonym table
would close the gap either -- a synonym table is a *form* device and nine of the fifteen misses are not
form failures at all.

### The new fact: the drift is toward over-specification

| direction | count |
| --- | --- |
| answer longer than the expected slug | **11 / 15** |
| answer shorter | 2 / 15 |
| same length, different mechanism | 2 / 15 |

The model is not naming a different field or inventing unrelated vocabulary. It is **describing the
incident** where the prompt asks it to **name the mechanism**: `replica-lag` -> `replica-apply-thread-saturation`,
`redis-latency` -> `redis-command-thread-saturation`, `disk-full` -> `disk-space-exhaustion`,
`container-crash` -> `native-ffmpeg-segfault`. That is a specific, testable claim about the failure mode,
and it is what makes the finding actionable -- the fix is a prompt constraint on *level of abstraction*,
not a bigger vocabulary.

### The instrument

Two artefacts, because the figure is published and this repository holds published figures to one
standard.

`scripts/probe-type-misses.mjs` is the classifier that ships. Its `counts` keys are the **same strings**
the classifier returns (`form-variant`, not `formVariant`); an earlier draft used camelCase keys with
kebab-case values and the mismatch was invisible in the human-readable output while breaking every
programmatic consumer. It exits `2` when a form variant is found, because that is a bug and the probe has
to be usable as a gate rather than only as a report.

`packages/core/test/type-miss-probe.test.ts` (8 tests) is the assertion half. It duplicates the
classifier rather than importing it, and a test runs the shipped script as a **subprocess** and requires
its output to match -- a test that imports its subject's helper proves only that the file agrees with
itself. The discriminating test constructs form variants, so `form-variant 0` passes for the right
reason rather than because a classifier returning `differentMechanism` for everything would also report
zero.

`scripts/injection/type-miss-probe.py` is the battery. It is the first in this repository whose
injections are **paired**, and expressing that is a change to the battery's own machinery:

| injection | pair | why half a pair is undecidable |
| --- | --- | --- |
| B | unreachable form-variant class + a case variant to fold | the class is empty in the baseline, so making it unreachable moves no count; the data edit alone is invisible because the variant folds |
| D | folding removed + a variant whose only token is upper-case | `POD_KILL` also *shares a token* once folded, so removing folding leaves it classified as a near miss and the count stays 0 |
| E | guard disabled + a non-exhaustive classifier | the three classes cover the transcription by construction, so no data mutation reaches the missing guard |
| E2 | dead guard + a non-exhaustive classifier | says whether E tests the guard or the crash: a `covered < 0` condition reports the same benign partition as a correct one |
| H | exit code forced to 0 + a variant that must trip it | the JSON is unchanged, so only an input *with* a form variant distinguishes "the gate is open" from "there is nothing to gate" |

The pairing is expressed as an **`also` slot**, applied to the result of the first mutation, with
`main` refusing the pair if the second edit changed nothing. An earlier version of the file described
the pairs in prose and reported four SURVIVED -- the correct outcome for a battery asserting half a pair
and describing the other half.

An injection whose second half is a no-op is not a mutation at all. B, D and H had to have their data
halves chosen rather than assumed: `NETWORK_LOSS` works for B because the class is *unreachable* so the
folded variant is discarded, and `CPU-SATURATION` works for D because its single folded token is not a
token of the expected slug. `POD_KILL` does not work for D, and that failure is recorded in the file.

### Verification

| gate | result |
| --- | --- |
| type-miss probe | 15 misses -- `form-variant 0`, `shares-token 9`, `different-mechanism 6`, over-specified 11 |
| type-miss test | 8 passed |
| type-miss battery | **14 caught, 0 survived, 0 inert** |
| probe battery | 10 caught, 0 survived, 0 inert |
| M1 test battery | 8 caught, 0 survived, 0 inert |
| component-rule battery | 8 caught, 0 survived, 0 inert |

### What this changes for M1

**The remaining M1 gap is a capability gap, and the next round has a specific hypothesis to test.** The
`type` field is the binding constraint, no normalizer change reaches it, and the measured failure mode
is over-specification rather than misidentification. That converts "the model is not accurate enough"
into "the prompt asks for a name and the model supplies a summary", which is a prompt change that can be
tested against these same fifteen rows.

The round did **not** raise the measured accuracy and does not claim to. It removed a hypothesis that
was standing on an argument rather than on a reading, and it replaced it with one that stands on a
measurement.

---

## Finding 82 -- Five gates were "covered by CI running them", which is not coverage

The audit said so itself, in the section on what the meta-gate does not reach:

> Five gates above still have no test naming them -- `check-readme-sample.mjs`, `build-example-bundle.mjs`,
> `gen-examples.mjs`, and the second exits of `check-cli-reference.mjs` and `gen-rcaeval-cases.mjs`. They
> are covered by CI running them against the real tree, which is a weaker claim than a test that forces
> them to fail, and it is the honest status.

This finding closes that gap and reports what closing it exposed. Four of the five now have a test file
of their own; the fifth already had one and gained the assertions it was missing. The count is not the
interesting part. **Two of the five gates were carrying a guarantee that does not exist**, and neither
was visible from a green CI run -- because a gate that runs correctly and reports correctly on a tree
that never violates it is indistinguishable, from the outside, from a gate whose failure branch is dead.

### What each test had to force

A test that runs a gate against the real tree and sees exit 0 proves the gate does not crash. It does
not prove the gate would refuse. Every test below therefore builds a tree in which the gate *must*
refuse, and asserts the refusal:

| gate | fixture | what the gate must refuse |
| --- | --- | --- |
| `check-readme-sample.mjs` | a throwaway tree whose `README.md` the test writes | no sample block; a `ts` block that never imports the package; a sample calling `runAllGates` with the wrong signature; one good sample beside one broken one |
| `build-example-bundle.mjs` | a copy of `examples/order-prod` plus a writable `site/assets/` | a stale archive; a stale metadata file; both missing at once; an empty example directory |
| `gen-examples.mjs` | a tree whose `docs/targets/*.md` the test writes | a stale `data.js`; a missing `data.js`; a marker naming an unknown target; a marker naming an unexported path; a field marker matching no documented file; an ignored `truncate` |
| `check-cli-reference.mjs` | a reference document synthesised from the binary's own `--help` | an implemented-but-undocumented command; a documented-but-unimplemented one; a flag the reference never mentions; a reference documenting no flag; more than one disagreement at once |
| `gen-rcaeval-cases.mjs` | a synthetic corpus on disk | a non-numeric `inject_time.txt`; a path whose head carries no suite; the default output path; a top-level file beside a suite; a fourth suite |

### What the forcing exposed

**A dead branch in `check-readme-sample.mjs`.** The gate has a second exit for the case where
`body.replace(/from '@rca-bench-factory\/core'/, …)` leaves the body unchanged, and its comment says the
rewrite "is asserted so a change to the import specifier surfaces here instead of producing a confusing
module-resolution error". The block reaches that loop only if `body.includes("from
'@rca-bench-factory/core'")` was true, and **that predicate and the rewrite's regex are the same literal
string**. `includes` is true exactly when the literal occurs; `replace` changes the text exactly when the
regex matches, which is exactly when the literal occurs. They cannot disagree on any input, so the branch
is unreachable and its diagnostic can never be printed.

This was found by trying to write the test that was supposed to cover it. Three bodies were attempted, and
each failed for a different reason -- which is how the equivalence became visible rather than arguable:

- a **double-quoted** import matches *neither* predicate, so the gate exits one guard earlier (the marker
  contains `from` and the quotes, so the block is never collected);
- a **line break** inside the specifier matches *both* (the marker is a substring test over the joined
  text; the regex does not care where the literal sits);
- an **escaped quote** inside a string literal matches *neither*.

The conclusion is not that the guard is wrong -- it fails safe, and the first exit already covers the case
its comment worries about. The conclusion is that the comment describes a reachable state and there is
none, so a reader takes a guarantee from it that the code does not provide. The test pins the equivalence
over a probe list and over the two literals, and says in its own comment that the `toContain` half is
weaker than it looks -- which the battery confirmed, by mutating the branch's *body* to `if (false)` and
observing the test file stay green.

**A redundant guard in `gen-rcaeval-cases.mjs`.** The walk tests `isDirectory()` before descending at
each of its three levels. At the top level that test is **redundant with the `try { readdirSync(suitePath)
} catch { continue }` immediately below it**: reading a file as a directory throws `ENOTDIR`, and the
catch skips precisely the entries `isDirectory()` would have skipped. No input separates them, so no test
can be written that fails only when the guard is removed.

This is the second instance in this repository of a check the battery proved redundant, and it is handled
the same way pass 5 handled `Number.isSafeInteger`: **kept, and named**. The difference is where the
record lives. There the check stayed in source with a comment; here the *injection* stays in the battery
with a reason, listed under `EXPECTED_SURVIVORS`. Reporting it as CAUGHT would need a dishonest mutation;
deleting it would lose the finding.

Two attempts at this row are also recorded, because both were near misses of the kind that produce a
false green: the first had the wrong indentation and the anchor silently missed, which the battery
reports as INERT rather than as a survivor; the second targeted `runDir.isDirectory()` on the theory
that the guard bounds the walk's depth. It does not -- the walk is a *fixed* three-level nest, so the
guard skips file entries at the run level and has nothing to do with depth. Depth is guarded by the
nesting itself, and the injection that establishes it reads the run level from one directory deeper.

### The battery, and why it mutates gates rather than probes

The four batteries beside this one mutate a *probe* and read a number it reports, because a probe is what
publishes a figure. This one mutates a **gate** and reads whether the gate's own test file goes red,
because what is in question is whether a test would notice a guard being removed. Twenty-five injections,
one per guard, each an anchored replacement that asserts its anchor was present:

**24 caught, 0 survived, 0 inert, 1 redundant (expected).**

The battery prints the *failing test names* rather than only a verdict, because a requirement phrased as
"some test fails" is satisfied by a test failing for an unrelated reason. `CLIREF 1` is the sharpest
case: it drops the trailing word boundary from `mentionsFlag`, and exactly **one** test fails -- the one
written for that boundary. The other five pass under the broken implementation, which is what makes that
test the boundary's guard rather than one of six tests that happen to overlap.

### Verification

| gate | result |
| --- | --- |
| five new/expanded test files | 59 tests -- 9 README, 9 bundle, 14 examples, 6 CLI-ref, 21 rcaeval |
| gate-test battery | **24 caught, 0 survived, 0 inert, 1 redundant** |
| core tests | **2500 passed** (was 2450) |
| core coverage | `src 100/100/100/100`, `All files 99.96/99.93/100/99.96` |
| cli tests | 173 passed, `run.ts 100/100/100/100` |
| golden master | PASSED (6 OpenRCA + 4 RCAEval byte-stable) |
| official regression | PASSED (8 targets scored, 1 skipped by contract) |
| examples / bundle / docs / pack | up to date / up to date / PASSED / 9 files verified |
| lint (5 checks) | all OK |
| all five workflow YAMLs | parse |

### What this changes

`audit.md`'s earlier sentence is retracted by supersession: the five gates named there are no longer
covered by CI running them. The honest status of the *remaining* gates is now worse rather than better,
and it is worth stating: `progress.md`'s P1-6 table lists 25 `process.exit(1)` sites across `scripts/`,
of which this round brings the covered count from 5 to 14. `verify-example-pack.mjs` (4 sites),
`check-official.mjs` (3 remaining), `check-no-vendored-data.mjs` (1), `apply-pins.mjs` and
`fetch-official.mjs` (4) are still covered only by CI running them -- and the two guards this round
found dead were both in the five that *had* just been covered. The implication is direct: the
uncovered remainder should be assumed to contain more of the same, not less.

---

## Finding 83: the stability gate was never run, and four of its properties could not fail

The previous finding closed on a claim that the *remaining* gates should be assumed to contain more
dead guards. Checking that claim turned up something the claim did not predict: a gate that was not in
the remainder, because nothing had ever executed it at all.

### The gate that no job ran

`scripts/verify-scorer-stability.mjs` opens with four properties and a rationale:

> Why this is worth a test rather than an assumption: the four live runs showed `strict` moving 0 -> 1
> -> 0 and `type` moving 5 -> 6 -> 4 on identical dataset, identical prompt and a nominally identical
> model. Reading that as "the model is noisy" is a conclusion about the model. It is only correct if
> the *instrument* is stable -- and the instrument had never been checked for that over the real data.

It answers exactly the question the M1 work depends on: whether a reported rate is a measurement or a
sample. Its status, checked by source rather than by reading the workflow's comments:

| question | answer |
| --- | --- |
| Named by `package.json` as `verify:scorer-stability`? | yes |
| Named by any workflow step? | **no** |
| In the `lint` chain with its four sibling static checks? | **no** |
| Named by any test file? | **no** |
| Executed by any CI job? | **no** |

Six properties, a documented rationale, a dedicated package script, and no job had ever run it. The
CI comment that reads "The scorer-stability battery is a gate, not a report" sits directly above the
step for `inject-stability.mjs` -- a *different* script whose name differs by three characters, which
is plausibly how the omission stayed invisible for two rounds. The distinction matters: the battery
asks whether the stability properties are *enforced*; this gate asks whether they *hold*, and neither
question subsumes the other, because the battery mutates the scorer while the gate is the thing doing
the asserting.

Running it by hand passes on the real dataset, which is the failure mode: a green gate that no job
executes is indistinguishable from a gate that does not exist.

### Four of the six properties could not fail

Being run is necessary and not sufficient. A property is enforced only if some mutation makes it fail,
so a probe was written (`scripts/injection/scorer-stability-probe.py`) that mutates the built scorer --
the gate dynamically imports `packages/core/dist`, never `src`, so mutating source would test the build
instead of the gate -- and requires the gate to exit non-zero **and name the property**.

The first run:

```
CAUGHT    determinism: stamp the report with the clock
SURVIVED  input purity: sort the caller's sample array in place
SURVIVED  order independence: pair predictions by position
SURVIVED  denominator: count every graded pair as having a miss
SURVIVED  denominator: drop the omitted half of the classification
```

Four survivors, each traced to a specific reason, and **three of the four were the gate's fault rather
than the mutation's**:

| survivor | diagnosis | whose fault |
| --- | --- | --- |
| `input purity` | the mutation sorted an *internal* array; the check snapshots the caller's `samples` as JSON, which an internal reorder cannot reach | mutation's -- corrected to write `s.scored = true` onto the caller's sample |
| `order independence` | a positional pairing is refused outright by `scoreExtractionSample`'s id-mismatch throw before any rate is computed | genuinely guarded upstream -- reclassified, not fixed |
| `denominator` (every pair counts as a miss) | both fixtures made *every* graded sample miss, so `samplesWithMisses` equalled the graded count with or without the guard | gate's -- needed a fixture with one fully correct sample |
| `denominator` (omitted) | the saturated fixture answers every field, so `omitted` was pinned at 0 and the counter was unfalsifiable | gate's -- needed a fixture that actually omits a field |

Two more defects surfaced while correcting those, and both are the same shape as the ones the previous
finding recorded -- **a check whose input cannot exhibit the failure it looks for**:

1. **`input purity` was checked on an already-scored dataset.** The determinism block ran
   `buildExtractionReport` twice *before* the purity snapshot was taken, so any idempotent mutation had
   already happened and `before` and `after` agreed. The check passed against a scorer that overwrote
   every sample's `incidentText` with `"MUT"`. The snapshot is now the first use of `samples`, and
   determinism runs on a separately re-read dataset so neither check is satisfied by the other's
   leftovers.

2. **`samplesWithMisses === graded` was true for the wrong reason.** With no clean sample in any
   fixture, the equality held whether or not the `detail.length > 0` guard existed. Dropping that guard
   entirely -- `if (true)` -- produced `ALL PROPERTIES HOLD`. A third fixture now answers the first
   sample correctly, which makes the two numbers differ (`18 of 19`) and is the only state in which
   that check can fail.

### A rejected mutation, recorded because it nearly became a false report

Changing `detail.length > 0` to `detail.length >= 0` looks like it breaks the same property and does
not: `detail` is built from an empty array and only ever grows by `push`, so it is never negative and
the two predicates are equivalent. That is an **equivalent mutant**. Scoring it as a survivor would have
produced a finding about the gate that was really an observation about a comparison operator, and it is
recorded in the probe with a note rather than quietly deleted.

The same discipline rejected the first determinism mutation. `Date.now()` returns the same millisecond
for two adjacent calls, so a clock-stamp mutation passes roughly as often as it fails -- a *flaky*
detector, which would have reported the property as enforced half the time and as a gap the other half.
The mutation is now a call counter with an explicit initialiser, which fails deterministically.

### Result

```
CAUGHT    determinism: stamp the report with a call counter
CAUGHT    input purity: write back onto the caller's sample
GUARDED   order independence: pair predictions by position
          refused upstream: scoreExtractionSample throws on an id mismatch before any rate is computed
CAUGHT    denominator: count every graded pair as having a miss
CAUGHT    denominator: stop counting the omitted half
battery: 4 caught, 1 guarded upstream, 0 survived, 0 inert
```

`GUARDED` is a third outcome alongside CAUGHT and SURVIVED: the property holds, for a reason the gate's
own check never observes. It is listed by name in `EXPECTED_GUARDED` so it stays visible, and the probe
*fails* if a labelled-guarded mutation ever stops being refused -- a label that silently rots is worse
than no label.

The gate went from 6 checks over 1 fixture to **14 checks over 3 fixtures**: saturated, partial
(`omitted=19, wrongValue=38`) and mixed (`samplesWithMisses=18 of 19`). Wiring it into the `lint` chain
rather than a step of its own is deliberate -- the five checks alongside it answer the same kind of
question, *is this tree in a state we are willing to measure*, and the chain is the one place a future
static check is already looked for.

### Verification

| check | result |
| --- | --- |
| scorer-stability probe | **4 caught, 1 guarded upstream, 0 survived, 0 inert** |
| `verify-scorer-stability.mjs` | ALL PROPERTIES HOLD, 14 checks, 3 fixtures |
| new test file | 12 passed |
| `pnpm lint` | 6 checks, all OK (the gate is now the sixth) |
| source restored after every probe run | identical to backup |

### What this changes for the audit's earlier claim

The previous finding said the uncovered remainder "should be assumed to contain more of the same, not
less". This finding is consistent with that and sharpens it: not only did the remainder contain more of
the same, the count of "the same" now includes a gate outside the remainder entirely, whose four green
properties were green because their inputs could not fail. The pattern across both findings is one
claim worth stating plainly:

> **A property that has never been shown to fail is a comment with a print statement.**

That applies to the five `process.exit(1)` sites this round added tests for, to the six properties of
this gate, and to any future check whose author has not asked what input would make it refuse. It is
also the reason the probe is now a CI step: the gate's green is only meaningful while something
independent keeps trying to break it.

---

## Finding 84: the gate-test battery's own verdict was unreadable, and it did not check its restore

Finding 83 closed by wiring its probe into CI. The first run of that commit went red -- at step 16,
which is the **gate-test battery from the previous round**, not at any step this round added. Steps 8
(lint, now with the stability gate) and 9 (coverage, 2512 tests) both passed on the runner.

The battery passes locally every time, and the runner's job log could not be read from here: the
download redirects to a host the project's proxy blocks, which is finding 55. So the failure had no
readable cause. Two defects follow from that, and neither is the failure itself.

### The verdict was three verdicts

The battery reports `SURVIVED` for three states that need three different repairs:

| state | what it means | the repair |
| --- | --- | --- |
| the tests ran and stayed green | the guard is genuinely not guarded | add the test, or delete the guard |
| the runner died before running anything | the instrument is broken | fix the invocation |
| the runner ran but collected no tests | the filter matched nothing | fix the filter |

A single line, "the test file stayed green, so it does not guard this", covers all three. This is the
**third appearance** of exactly that conflation in this repository. Pass 5 found it in two other
batteries, where `-1 > 0` is false so a crashed runner counted as a *caught* mutation, and a collection
error reports `failed: 0, passed: 0` so "nothing was detected" read as "nothing to detect". The
distinguishing quantity is the **total the runner reports**, never the failure count: only a run that
collected tests can make a claim about a guard.

`_diagnose` now prints which of the three it saw, with the runner's own last lines when it collected
nothing. Verified against all three inputs rather than assumed:

```
-- the runner collected no tests, so this says nothing about the guard.
   The last lines it printed were:
     Error: Cannot find module 'vitest'
-- the 9 collected test(s) all passed with the guard removed.
-- the runner exited 137 after collecting 9 test(s), but reported
   no failing test. That is a crash or a timeout, not a guarded property.
```

### It never verified that it restored the gates

The battery mutates a gate script, runs that gate's tests, and restores the file in a `finally`. Every
other battery in this repository *prints* a restore check; this one had none -- neither a print nor an
assertion. That matters more here than elsewhere, because this battery writes to the scripts that
**later CI steps execute**. A run interrupted between `write_text(mutated)` and the `finally` would
leave a gate mutated, and every subsequent step would fail for a reason none of them could name. The
whole job would then be diagnosed as "the tests are broken" rather than "the battery did not clean up".

The restore is now asserted against bytes captured **before** any mutation, because re-reading the file
at the end would compare a mutation against itself.

### A preflight check, for the failure that already happened once

`inject-stability.mjs` shipped with an absolute path that passed locally and threw on the runner
*before its first injection*, so it reported a clean-looking run that had measured nothing (finding 77).
A callability probe now turns that state into one line instead of twenty-five rows that mean the
opposite of what they appear to say.

### What this does not claim

The underlying CI failure was **not** diagnosed. What changed is that the next run will name its own
cause: the battery now reports which injection failed, why the verdict was what it was, and whether it
left the tree mutated. Reporting that the cause is still unknown is the honest status, and it is the
reason the diagnosis was built rather than the failure being re-run and hoped over.

No assertion was weakened to make it pass: 24 caught, 0 survived, 0 inert, 1 redundant (expected), and
the restore assertion added 1 more way for the run to fail.

A one-line consequence, recorded because it is the same class: `scripts/injection/__pycache__/` was
committed by accident in the first attempt at this change, because `.gitignore` did not list it and
`injection-write-discipline.test.ts` runs `py_compile` over these batteries as a syntax check. Build
output is now ignored.

## Finding 85: the preflight ran the whole suite, and the battery could not report its own cost

Finding 84 built an instrument for a step that was failing in CI without a readable cause, and named
what it had not done: the failure itself was never explained. This finding starts from that step's
measurements rather than from its verdicts, and it did explain the failure -- not the way it was
expected to.

### The measurement that framed it

Running CI steps 11-16 in order, locally, reproduces every verdict the battery prints. It does not
reproduce the wall clock:

| step | runner | local |
| --- | --- | --- |
| 11 scorer stability | 6s | 7s |
| 12 component rule | 10s | 11s |
| 13 M1-ceiling probe | 1s | 0s |
| 14 M1-ceiling tests | 10s | 11s |
| 15 type-miss probe | 0s | 1s |
| **16 gate-test battery** | **162s failure** | **107s exit 0** |

The four steps that bracket it agree to within a second. Step 16 is the only one that spawns a
process per injection -- 25 of them -- and the only one that diverges. The job used 271s of a 1200s
budget, so the step returned a verdict rather than being killed: `-1` is not what a timeout looks
like, and neither is a completed step with a failure conclusion and ten skipped successors.

That left two possibilities, and the battery could distinguish neither, because it printed no
duration. A run that is slow and a run that is unguarded produce the same bare exit code. **A quantity
the battery measures every time and never reports** is the same defect as a verdict with three
meanings, one level down.

### The preflight was not a preflight

`assert_vitest_is_callable()` -- added by finding 84 so that a broken runner becomes one line instead
of twenty-five misleading rows -- built its probe like this:

```python
VITEST = ["pnpm", "exec", "vitest", "run", "--root", "packages/core"]
subprocess.run([*VITEST, "--version"])
```

which is:

```
pnpm exec vitest run --root packages/core --version
```

`run --root packages/core` puts vitest into run mode, and the trailing `--version` is accepted and
ignored. So the probe **executed the entire core suite** -- 92 files, 2520 tests, 54s on the runner --
and returned the suite's exit status as if it were a version query. Measured both ways before
changing anything:

```
A: pnpm exec vitest --version                               rc=0 in 0.3s
B: pnpm exec vitest run --root packages/core --version      still running at 10.1s
```

The probe also had no `timeout=`. Unbounded dead time *before the first injection* is precisely the
shape of finding 77 -- a battery that never started, reporting as though it had -- re-created inside
the check written to catch it. A preflight that silently spends a minute is not a preflight; it is a
second copy of the problem.

Fixed: the command is spelled out, bounded at `PREFLIGHT_TIMEOUT_S = 30`, and a timeout is reported as
its own outcome with the command and the wait, because those are the two facts a reader needs.

**Measured effect: the battery went from 107s to 80.4s.** The 27s is the redundant suite run, and it
was being paid on every invocation of a step whose whole purpose is to avoid redundant work.

### What the preflight does and does not explain about CI

It does **not** explain the 162s failure, and saying so is the point. The preflight's ~54s sits
*inside* the measured 162s -- it is not a step prepended to a green run. So the arithmetic is: 162s of
runner time produced a non-zero verdict, and the preflight accounted for roughly a third of it before
the first injection. Whether the remaining 108s contains an injection that decided differently on a
slower machine is **not established**, and the fix is not a claim that it is.

What changed is that the next run will say. Each injection prints its own duration, the run prints its
total and its slowest entry, and a run that exceeds its bound prints `TIMEOUT` -- a fourth outcome,
reported separately from `SURVIVED`, and reaching the failure condition. The three earlier rounds that
paid for this distinction each paid because two opposite repairs printed the same word; this is the
same distinction applied to duration.

### The test that could not be written the obvious way

The TIMEOUT branch had to be shown to execute rather than merely written. The obvious approach --
lower `PER_INJECTION_TIMEOUT_S` in a copy of the battery and run it -- **does not work, and the reason
is worth recording**:

Running the battery from inside vitest means vitest spawning vitest, because `run_tests` invokes
`pnpm exec vitest run`. In that nested environment the inner runner **collects no tests**, and the
battery reports `README 1` as SURVIVED with its own diagnostic saying so:

```
-- the runner collected no tests, so this says nothing about the guard.
```

Run directly, the same battery is green in 81.1s. So the nested run measured the nesting, not the
battery -- **a false survivor created by the harness**, which is the exact class of defect this round
is about. The test file therefore does two separate things: it asserts the source-level properties
(the bound exists and is read; the accumulator reaches the print; `finally` wraps the timed call), and
it exercises the TIMEOUT branch on a **self-contained fake** that reproduces the control flow with a
sleeping command. Running the battery for real is CI's step 16: one process, no nesting.

### A source scan that read its own explanation

The assertion that the broken command is gone failed on first run, because the docstring quotes the
broken command in order to explain why it was wrong:

```
174:     The first version of this function ran `[*VITEST, "--version"]`, which is
```

A whole-file scan cannot tell "this call is made" from "this call is explained", and forbidding the
second pushes an author to delete the reason rather than the defect. This repository had already
settled that question in `injection-write-discipline.test.ts`, so the same answer is used here:
comments and string literals are stripped before the scan.

### Verification

| check | result |
| --- | --- |
| py_compile | clean |
| core suite | **2520 passed (91 files)**, +8 |
| core coverage | `src` `100 \| 100 \| 100 \| 100`; all files `99.96 \| 99.93 \| 100 \| 99.96` |
| cli coverage | 173 passed, `100 \| 100 \| 100 \| 100` |
| gate-test battery | **24 caught, 0 survived, 0 inert, 0 timed out, 1 redundant**; source restored |
| gate-test battery cost | **80.4s** (was 107s), slowest injection 7.5s |
| new test file | **8 passed in 1.06s** |
| lint | six checks OK, `ALL PROPERTIES HOLD` |
| typecheck | clean |

### The claim this does not make

Neither defect was shown to cause the CI failure, and finding 85 does not say they did. It says the
step's cost is now measurable, the preflight no longer runs 2520 tests to answer a version question,
and the next run will name the injection if one behaves differently on a slower machine. The previous
round closed on "a property that has never been shown to fail is a comment with a print statement";
this round adds the neighbouring case -- **a quantity that is computed every run and never printed is
the same comment, one line further down.**

---

## Finding 86: the battery's wrong verdict came from a second copy of itself, and the CI log could not say so

Finding 85 closed on "the next run will name the injection if one behaves differently on a slower
machine". The next run did not have to. The failure turned out to be in neither the assertions nor the
machine, and the reason it took a fourth round to see is that **the only place the answer existed was
a log this environment cannot open.**

### What the step timings said, and what they ruled out

Three CI runs of the identical step, two of them on trees whose `scripts/` are byte-identical
(`bafbdd7` → `e022576` touches only `docs/audit.md`):

| run | sha | preflight | step 16 | local |
| --- | --- | --- | --- | --- |
| 36295105757 | `30ff920` | whole-suite | **162s** failure | 107s |
| 36325497975 | `bafbdd7` | fixed | **65s** failure | 80.4s |
| 36325967547 | `e022576` | fixed | **107s** failure | 80.4s |

Two identical trees gave 65s and 107s. The step's duration is therefore **not a function of the code**,
which retires finding 85's own slowness hypothesis: a 65s runner is *faster* than the 80.4s local run
that passes. Everything the previous round added -- the `TIMEOUT` outcome, the per-injection `[x.xs]`
lines, the fixed preflight -- was in place for all three runs, and step 16 still failed in all three.

What those additions produced was the **shape** of the failure, printed to the one channel that is not
readable here. `GET /actions/jobs/{id}/logs` returns a 302 to `productionresultssa16.blob.core.windows.net`,
and the proxy refuses the connection (`http=000`); the check-run annotation says only
`Process completed with exit code 1` at `.github:353`. That limitation is finding 55, and it had turned
every CI failure in this round into a verdict with no cause.

### The local run that went red with no explanation, and had one

A plain local battery run then failed:

```
23 caught, 0 survived, 1 inert, 0 timed out, 1 redundant (expected)
time: 97.8s across 24 injection(s); slowest 10.1s (CLIREF 1. ...)

the battery did not restore its own mutations:
  scripts/build-example-bundle.mjs
  scripts/gen-examples.mjs
  scripts/gen-rcaeval-cases.mjs
RC=2
```

Three causes were tested and eliminated, in this order:

1. **The loop's restore is correct.** `finally: path.write_text(original)` wraps the timed call, and a
   full instrumented trace -- re-reading every gate after every one of the 25 injections, comparing
   against the import-time `ORIGINALS` -- printed **zero DIRTY markers and zero INERT**, 25 restores,
   tree clean. The logic is not the defect.

2. **The tests are readers, not writers.** `build-example-bundle.test.ts:72` and
   `gen-examples.test.ts:62` copy the live gate *into* a scratch tree and run it there; the sources
   were hashed before and after a full run of all three gate test files and were unchanged.

3. **`ORIGINALS` is not stale.** Re-imported against the tree, all five entries matched disk exactly.

What is left is the one thing a single process cannot do to itself: **a second process.** The `INERT`
on `RCAEVAL 3` is the tell -- its anchor `return Object.entries(perSuite)\n    .sort(...)` is on a line
no other mutation touches, so the file it read had been changed by something else between two
injections. Two copies both read the same `original` and each writes it back over the other's mutation.

Reproduced on demand, two copies started three seconds apart:

```
22 caught, 1 survived, 2 inert, 0 timed out, 1 redundant (expected)
the battery did not restore its own mutations: ...
RC=2
```

**A survivor, from a guard that is in fact caught.** `SURVIVED` is the one verdict in this repository
that must never be manufactured -- it is read as "write a test" and sends the next reader to fix
something that was never broken. Two batteries sharing one working tree while both rewrite it produce
exactly that, and the corruption is invisible in the numbers: 22 caught still looks like a battery.

### The fix, and what it does not do

The battery takes an `O_EXCL` lock in the OS temp directory before its first mutation and refuses the
second run with exit 3, naming the lock path, without printing a summary line. Measured: two copies
4s apart -- the second exited 3 with the refusal and no verdict, the first finished **24 caught, 0
survived, 0 inert**, source restored, lock released.

Why a lock and not a per-run copy of the tree: this battery's claim is about the **shipped** gates, and
a verdict about a copy is a verdict about the copy. The resource that must not be shared is the working
tree being rewritten, and refusing is loud and names its cause, while a corrupted baseline is a wrong
number that reads as a finding. A stale lock after a SIGKILL is accepted deliberately -- the refusal
names the file, so the repair is one `rm`, and a staleness heuristic can decide a *running* battery is
dead and reintroduce the very corruption.

**This does not explain CI's failure.** CI runs its steps sequentially -- no two batteries overlap
there -- so the race fixed here is a local hazard, not the CI cause. What CI's failure is remains open,
and the honest statement is that it is still unreproduced after the preflight, slowness, coverage
artifacts, a broken CLI, missing generated files, the restore logic, the readers, and now concurrency
have each been eliminated.

### Closing the channel that kept the answer out of reach

Since the log cannot be read here and the artifact API can (`GET /actions/runs/{id}/artifacts` answers
cleanly, and `official-data.yml` already ships one), the battery now writes
`gate-tests-battery-report.json` on **every** exit path and CI uploads it `if: always()`. The report
carries each injection's verdict, the gate's test file, the seconds it took, the failing test names,
and the run summary. A failing CI run is now a file that can be fetched and read, instead of a bare
exit code -- which is the difference between a failure this environment can diagnose and one it can
only observe.

### Verification

| check | result |
| --- | --- |
| py_compile | all seven batteries clean |
| new test file | **7 passed** (`gate-test-battery-exclusion.test.ts`) |
| concurrency, before | 2 copies 3s apart → **1 survived, 2 inert, tree dirty, rc=2** |
| concurrency, after | 2 copies 4s apart → second **rc=3 refused**, first **24/0/0**, tree clean |
| core suite | **2527 passed (92 files)**, +7 |
| core coverage | `src` `100 \| 100 \| 100 \| 100`; all files `99.96 \| 99.93 \| 100 \| 99.96` |
| cli coverage | 173 passed, `100 \| 100 \| 100 \| 100` |
| gate-test battery | **24 caught, 0 survived, 0 inert, 0 timed out, 1 redundant**; 78.9s; source restored |
| CI steps 11-25 | **all pass locally in order, one uninterrupted chain** |
| lint | six checks OK, `ALL PROPERTIES HOLD` |
| typecheck | clean |

The sentence this round adds to finding 85's "a quantity that is computed every run and never printed
is the same comment, one line further down" is the next one along: **a verdict that is printed to a
channel nobody can open is not a measurement either.** The battery was right about every guard, in
every run, and the reason it looked wrong for three rounds is that it said so where no one was
listening.

### Addendum to finding 86: the artifact was listed and still could not be read

The report channel added above was `actions/upload-artifact`, chosen because
`GET /actions/runs/{id}/artifacts` answers cleanly from this environment. The next
CI run showed that reasoning was one step short. Step 16 failed at **72s**, and:

```
Upload the gate-test battery report    success   0s
ARTIFACTS: total: 1
 - gate-tests-battery-report 1152 id= 10934848175
```

The artifact exists, is listed, and has the size the report should have. Fetching
its content does not work from here:

```
GET /actions/artifacts/10934848175/zip  ->  302
  Location: productionresultssa17.blob.core.windows.net/...
direct GET                                                     http=000
```

So the upload **proved the report was produced and did not make it readable** --
metadata reachable, content not. Measured across every channel this project has:

| channel | metadata | content |
| --- | --- | --- |
| job log | n/a | blocked (finding 55) |
| artifact | **listed** | blocked (`blob.core.windows.net`) |
| check-run output | empty without `checks:write` | n/a |
| **git object** | reachable | **reachable** |

Git objects are the one channel that is both, because `api.github.com` serves them
itself: `GET /repos/{o}/{r}/contents/{path}?ref={branch}` returns the bytes
base64-encoded in the response. Verified end to end before wiring it in -- the new
`scripts/publish-battery-report.py` committed a report to a scratch `ci-reports`
branch and both `HEAD` and `gate-tests-battery-report.json` came back byte-exact
through the API **from inside this environment**, which is the only test that
matters for a channel whose purpose is to be readable here.

The branch is orphaned and never `master`: the report is CI output, it is
overwritten every run, and it must not land in the tree the other gates read. The
artifact upload stays, because it is what a human reading the run page wants.

**The generalisation, and it belongs beside finding 85's and this finding's closing
lines:** a channel can be reachable and still not carry content, so "I can list it"
is not the same as "I can read it". That is the fourth form of the same mistake in
this sequence -- a property never shown to fail, a quantity computed and never
printed, a verdict printed to a channel nobody can open, and now **a report
published to a channel that answers with a redirect**. Each one looked like the
thing it was meant to be.

---

## Finding 87: the publish step reported success while publishing nothing

Finding 86's addendum ended by wiring the battery's report to the orphan
`ci-reports` branch, after verifying through `api.github.com` **from inside this
environment** that a git object is a channel that both is reachable and carries
content. The wiring used the workflow's own `GITHUB_TOKEN`. The next run closed
the loop, and the answer was no.

### The measurement

Run `36331975404` on `ab25e7357` -- the first run whose commit contains the
publish step:

```
 16 FAIL  Gate-test battery (...)
 17 ok    Publish the gate-test battery report
 18 ok    Upload the gate-test battery report
```

Step 17 says **`ok`**. The branch it was supposed to create:

```
GET /git/ref/heads/ci-reports           -> 404
GET /branches?per_page=50               -> gh-pages, master
```

**No branch. No report. No error visible anywhere.** A step that reports success
while publishing nothing is precisely the failure this sequence has been about
since finding 85, appearing one level up from where it was fixed.

### Two layers, and the second is the finding

**The first layer is an ordinary permission mistake.** The workflow declares

```yaml
permissions:
  contents: read
```

at the workflow level, so no `GITHUB_TOKEN` in the job can create a ref. The
publish answered `403`. The fix is one line: `contents: write`. The grant is
workflow-wide because that is the smallest unit GitHub offers, but only one step
uses it, and the branch it writes to is not `master`.

**The second layer is why it stayed invisible, and it was deliberate.**
`scripts/publish-battery-report.py` caught every error, printed it, and returned
0:

```python
except (urllib.error.URLError, urllib.error.HTTPError, KeyError, OSError) as exc:
    # Deliberately not fatal. This step is a diagnostic channel; failing the
    # job here would replace the battery's verdict with this one, which is
    # the mistake the battery itself was just repaired for.
    print(f"could not publish the report: {exc}")
    print("the battery's own exit code still carries the verdict")
return 0
```

**The reasoning was sound and the code was wrong.** The comment's claim is true:
a diagnostic channel that can fail the build does replace the verdict it carries.
But `return 0` does not avoid that -- it only hides the broken channel, and a
broken channel is *also* a false report. The observed outcome is the proof: the
run page said the report had been published, and no report existed.

The two properties are separable, and the code conflated them:

* Failing this step **cannot** flatter the battery. Step 16 has already run; its
  exit code is already recorded. Nothing this step returns can turn a red battery
  green.
* Failing this step **can** stop a broken channel from reporting success, which is
  the only thing it should ever have been trusted to do.

So the exit code is now three-valued, and the distinction is the point:

| outcome | exit | why |
| --- | --- | --- |
| published | 0 | the channel worked |
| nothing to publish (no report, or no token) | 0 | both are real reasons to do nothing |
| **publish attempted and failed** | **1** | this is not a verdict about the battery, it is a broken channel |

### The test that had to be reversed

`packages/core/test/publish-battery-report.test.ts` asserted the old behaviour:

```ts
it('a failed publish cannot change the verdict the battery reported', () => {
  // ... must still exit 0, and must say that the battery's own exit code
  // is what carries the verdict.
  expect(result.status).toBe(0);
  expect(result.output).toMatch(/exit code still carries the verdict/);
});
```

**This test passed while the bug shipped.** It encoded the wrong property in an
assertion, which is the fifth form of the same mistake: after a property never
shown to fail, a quantity computed and never printed, a verdict printed to a
channel nobody can open, and a report published to a channel that answers with a
redirect, the fifth is **a property asserted backwards so the test enforces the
defect**. The case is rewritten to require `status === 1` and
`/channel is broken/`, with the CI evidence in the comment so the reversal cannot
be read as a change of preference.

A sixth case asserts the shipped workflow carries `contents: write`, that the
grant does not reach `master`, and that the publish step is still `if: always()`.
That is asserted against the file that was actually wrong -- a permission lives in
YAML, not in the script, and a test of the script alone could not have caught it.

### Verification

| check | result |
| --- | --- |
| rejected token | **exit 1**, `could not publish` + `channel is broken` (was exit 0) |
| published, then read back | `ci-reports` at `6cf392896`; `HEAD` = 143-byte summary |
| `gate-tests-battery-report.json` | **13214 bytes, `cmp` clean -- byte-exact** |
| workflow YAML | parses; `permissions = {'contents': 'write'}`; 26 steps |
| publish test file | **6 passed** |
| core | **2533 passed (93 files)**; `src 100/100/100/100`; all files `99.96/99.93/100/99.96` |
| gate-test battery | **24 caught, 0 survived, 0 inert, 0 timed out, 1 redundant**; 80.2s; source restored |
| lint | `ALL PROPERTIES HOLD` |
| typecheck | clean |

### What this does and does not settle

**It settles the channel.** `ci-reports` now exists, holds a byte-exact copy of a
real report, and is readable from this environment. Whether CI's step 16 fails is
a separate question that the next failing run will finally answer in full.

**It does not explain CI's step-16 failure.** The publish bug is downstream of it
and independent: it affected whether the *result* could be read, never whether the
battery passed. That question is still open, now with a channel that works.

### The lesson

**A tolerant error handler is an untested error handler.** The handler ran on
every CI invocation, took the 403 branch on every CI invocation, and printed the
correct message every time -- and the step reported green every time, because
nothing ever asserted what it exited with. The line that was supposed to be
defensive was the line that made the defect unobservable, and the test that was
supposed to catch it asserted the defect instead.

---

## Finding 88: the report could be read and still not be understood

Finding 87 fixed the channel. Run `36333833579` on `e188c8870` was therefore the
first CI run whose per-injection verdicts were readable from this environment, and
it closed the loop with an answer nobody expected:

```
HEAD: gate-test battery, run 36333833579 on e188c8870:
      0 caught, 24 survived, 0 inert, 0 timed out, 1 redundant (expected); 108.1s
```

**Every injection a survivor.** For a battery whose whole purpose is to prove the
guards are guarded, that is either the worst possible verdict or a battery that
could not speak, and the report could not distinguish them.

### First: the mechanism is sound

Before blaming CI, the same mutation was applied by hand and the **exact CI
command** run against it:

```
$ pnpm exec vitest run --root packages/core check-readme-sample.test.ts
 Test Files  1 failed (1)
      Tests  6 failed | 3 passed (9)
RC=1
```

So the injection reaches the test, the test fails, and the runner propagates the
failure. And the CI timings match a *working* run, not a crashed one:

| injection family | local (passing run) | CI (all "survived") |
| --- | --- | --- |
| README | 1.6s | **1.4s** |
| BUNDLE | 2.1s | **2.4s** |
| EXAMPLES | 2.5s | **2.9s** |
| CLIREF | 7.4s | **11.7s** |

vitest started in CI. It ran for about as long as it does here. It simply did not
fail -- or it did not collect the tests, and **the report had thrown away the
quantity that separates those two**.

### The discarded quantity

`_diagnose` already computes the collected test count, because two other batteries
in this repository were repaired for conflating exactly these cases:

```python
collected = re.search(r"Tests\s+(\d+) (?:failed|passed)", output)
...
if total == 0:
    return ("-- the runner collected no tests, so this says nothing about the guard.\n"
```

It then prints that, and **the print goes to the job log** -- the one channel this
project cannot read (finding 55). Meanwhile `write_report` stored `[]` for every
non-CAUGHT verdict:

```python
results.append((name, "SURVIVED", [], elapsed))
```

So "the runner started and found nothing" and "the tests ran and passed" produced
**byte-identical reports**, and they call for opposite repairs. One is a
configuration bug; the other is twenty-four genuine findings that would each need
a new test.

**This is finding 85's lesson one layer out.** Finding 85 was a quantity computed
and never printed. This is a quantity that *is* printed, to a place nobody can
read. The intermediate fix -- write it to a file -- does not help if the file
carries a subset of what the console got.

### The fix: three fields, all three arms

Every row now carries:

| field | meaning |
| --- | --- |
| `collected` | how many tests the runner itself says it ran |
| `exit_status` | what the runner exited with |
| `diagnosis` | `no_tests_collected` / `tests_passed` / `runner_error` |

`no_tests_collected` means the runner found nothing and the row says **nothing**
about the guard. `tests_passed` with `collected > 0` is a **real** survivor.
`runner_error` is a crash that reported no failing test. Three causes, three
repairs, and now one field.

They are wired into **all three verdict arms**, asserted by count in the test,
because a field wired into one arm answers the question only for the cases that
already had an answer.

### A bug in the helper, found while writing it

The first `collected_count` anchored the passed count on the pipe:

```python
passed = re.search(r"\|\s*(\d+) passed", output)
```

A fully-green run prints `Tests  9 passed (9)` with **no pipe**. That pattern
returns 0 for a run that collected nine tests, and `diagnosis` would then label it
`no_tests_collected` -- **the exact confusion this field exists to remove,
reproduced inside the fix for it.** It was caught by checking the helper against
shapes rather than against one example:

| output | expected | first version | fixed |
| --- | --- | --- | --- |
| `Tests  6 failed \| 3 passed (9)` | 9 | 9 | 9 |
| `Tests  9 passed (9)` | 9 | **0 -- MISMATCH** | 9 |
| `Tests  0 passed (0)` | 0 | 0 | 0 |
| `Tests  1 failed \| 8 passed (9)` | 9 | 9 | 9 |
| `Tests  3 failed (3)` | 3 | 3 | 3 |

The test now enumerates six summary shapes **and executes the helper through
`python3`** rather than reimplementing it in TypeScript, because a
reimplementation would pass while the shipped regex was wrong.

### One step further: a verdict without its evidence

A report that can be read may still not be understood -- `0 caught, 24 survived`
and then nothing, while the output that would explain it went to the console. So
every row also carries `output_tail`: the runner's last twelve non-blank lines,
where the assertion failure and the summary live.

**A verdict without its evidence is the same defect as a verdict without its
channel, one step further along.** The CAUGHT rows now ship the failing assertion
and its source line inside the report -- `expect(result.status).toBe(0)` at
`check-readme-sample.test.ts:353` -- so the next CI failure is diagnosable from the
report alone.

### Verification

| check | result |
| --- | --- |
| core | **2537 passed (93 files)**; `src 100/100/100/100`; all files `99.96/99.93/100/99.96` |
| gate-test battery | **24 caught, 0 survived, 0 inert, 0 timed out, 1 redundant**; 78.5s; source restored |
| REDUNDANT row | `collected: 21, exit_status: 0` -- 21 tests ran and passed, which is the distinction working |
| report size | 13214 -> **31678 bytes** |
| exclusion test file | **11 passed** |
| publish test file | **6 passed** |
| lint / typecheck / py_compile | `ALL PROPERTIES HOLD` / clean / clean |

### What this does and does not settle

**It settles the report's ability to answer its own question.** The next CI
failure's rows will say which of the three causes applied, and carry the runner's
own output, without needing the log.

**It does not explain the 24 CI survivors.** This round did not diagnose them; it
put the means of diagnosing them into the report. That question is still open, and
it is now the only open question about this gate.

### The lesson

**Evidence has to travel the whole way or it is not evidence.** Finding 85's
quantity was never printed. Finding 87's channel printed to nowhere readable. This
one printed to a place that was readable and carried less than the console did.
Each repair was correct and each was one step short, because "can I read it?" and
"can I understand it?" are different questions and only the first is answered by
having a channel at all.

---

## Finding 89: the battery's failure path crashed before it could report

Finding 88 added fields to each verdict. Doing that changed the width of the tuple
the battery builds, and **one reader of that tuple was not updated**:

```python
# the builder, after finding 88
results.append((name, "SURVIVED", [], elapsed, {"collected": collected, ...}))

# the failure-listing loop, unchanged
for name, verdict, _, _ in results:
```

On CI that raises

```
ValueError: too many values to unpack (expected 4)
```

**after** the summary prints and **before** `write_report` on that path. So the
run printed its verdicts to the log, crashed, and wrote no report at all.

### How it was found

The symptom was not a crash message -- it was **silence with the shape of
success**. Run `36335878589` showed:

* step 16 `FAIL` (as always),
* step 17 `Publish the gate-test battery report` **`ok`**,
* step 18 `Upload the gate-test battery report` **`ok`**,
* `GET /actions/runs/36335878589/artifacts` -> **`total_count: 0`**,
* `ci-reports` still pointing at the *previous* run's commit `9eac31ce1`.

**Zero artifacts and a green upload step** is the contradiction that led to it.
The publish step reported success because it found no report and treated that as
"nothing to do" -- correct behaviour, and it is what made a crashed battery look
like a run that had simply not produced anything yet.

### The two facts that had to be kept apart

It would have been easy, and wrong, to read this as the explanation of the
24 survivors. It is not:

1. **The 24-survivor report was real.** It came from `e188c8870`, where the
   builder and the loop were both four-wide and consistent, so that run completed
   and genuinely reported every injection surviving. **That question is still
   open.**
2. **This crash is new and is mine**, introduced by finding 88's field addition,
   and it affected only whether *this* run's report existed.

### The fix, and how the failure path was proven

The loop now unpacks with a star:

```python
for name, verdict, *_ in results:
```

Proving it needed the failure path, which never runs on a green battery. It was
forced by emptying `EXPECTED_SURVIVORS` so `RCAEVAL 2` becomes a plain `SURVIVED`:

| before the fix | after the fix |
| --- | --- |
| summary printed, then `ValueError`, **no report** | `RC=1`, failure list printed, **report written (31676 bytes, 9 fields)** |

The test asserts the shape rather than the crash -- every `results.append((name,`
must build at least five fields, and no reader may use a fixed four-wide unpack --
so adding a sixth field cannot silently reintroduce this.

### An unrelated hazard, found while verifying

Running the battery and a plain test run **concurrently** corrupts the test run.
Six `check-readme-sample` failures appeared that way and vanished when the two were
run in sequence, and `git status` showed the gate itself clean, so the mutations
were restored and the *reader* was the casualty.

The `O_EXCL` lock from finding 86 excludes a second **battery**; it does not
exclude a plain `vitest` run, which is a reader and can read a gate mid-mutation.
Recorded rather than fixed here because the honest fix is a question -- whether a
reader should also take the lock, or whether the battery should mutate a copy and
the gate test should read the copy -- and the current behaviour is a **local
development hazard, not a CI one**, since CI's steps are sequential.

### The lesson

**A field added to a tuple is a change to every reader of it, and the compiler does
not say so in a dynamically typed language.** Python would have caught this at the
call site had the tuple been a dataclass or a `NamedTuple`; with a bare tuple the
only guard is a test that asserts the width. There is now one.

**And the failure was invisible for the third time in three rounds, each time for a
different reason**: finding 87's channel reported a success it had not achieved,
finding 88's report was readable and mute, and this one was a *step* reporting
`ok` about a file that did not exist -- while the artifact count, which nobody was
reading, said `0`.

## Finding 90: the 24 survivors were a parse failure, and the parser was reading a terminal's output on CI

Finding 88 closed with the question still open, in these words:

> **The 24-survivor report was real.** It came from `e188c8870`, where the builder
> and the loop were both four-wide and consistent, so that run completed and
> genuinely reported every injection surviving. **That question is still open.**

Finding 88 also built the instrument that could answer it, and said so: the rows
would "say which of the three causes applied, and carry the runner's own output,
without needing the log." The next CI run produced that report. **It answered the
question, and the answer was that nothing had survived at all.**

### The evidence

Run `36337157149` on `d33b4e47a`, the first report to carry `collected`,
`exit_status`, `diagnosis` and `output_tail`:

```
summary: {'caught': 0, 'survived': 24, 'inert': 0, 'timed_out': 0, 'redundant': 1}
=== DIAGNOSIS COUNTS ===            no_tests_collected: 25
=== collected / exit_status ===     collected=0 exit_status=1: 24
                                    collected=0 exit_status=0:  1
```

Every row said the same thing: *the runner found nothing, so this row says nothing
about the guard.* And the row's own `output_tail` -- the field added for exactly
this -- said the opposite:

```
❯ test/check-readme-sample.test.ts:353:27
  353|     expect(result.status).toBe(0);
     |                           ^
```

That is an assertion failure in a test that ran. `repr()` on the captured text
settled the rest:

```
'\x1b[36m \x1b[2m❯\x1b[22m test/check-readme-sample.test.ts:...'
```

**The frames are wrapped in SGR colour codes.** CI is not a TTY and vitest emits
them anyway; a local run does not. Every regex in the battery that anchored on the
first visible character therefore matched in a terminal and missed in CI.

### Four defects, and the first fix only addressed one

`failed_count` searched for `Tests\s+(\d+) failed`, and vitest prints the summary
**below** the failure frames. The report keeps a twelve-line tail, which stops
inside the last frame. So the count was 0 -- and the CAUGHT condition is exactly

```python
if status != 0 and failed_count(output) > 0:
```

**Twenty-four injections that the runner had plainly caught fell through to
SURVIVED.** That is the whole of the 0-versus-24 discrepancy. It was never a
behavioural difference between the two machines; it was one machine's text being
read by a parser written for the other's.

Fixing that is not enough, and the three further defects are each invisible to the
others:

| # | defect | what it produced | why the previous fix missed it |
| --- | --- | --- | --- |
| 1 | summary absent from a tail | `failed_count` 0 → SURVIVED | the summary is below the frames by construction |
| 2 | ANSI between marker and name | same, on CI only | a terminal run has no escapes, so local stayed green |
| 3 | `collected_count` fell back to counting frames | a **lower bound printed as `collected`** | the fallback was written to make the count non-zero, and it did |
| 4 | `diagnosis` branched on that undercount first | twenty-four real failures labelled `runner_error` | the label looked right: status was 1 and no summary was seen |

Defect 4 is the one that would have cost the most time in the next round. Every one
of those rows carried `expect(result.status).toBe(0)` with the caret printed under
it, and was reported as *"the runner exited non-zero without reporting a failure"*
-- a crash. A reader following that would have gone looking for a crash in a run
that had reported its failure precisely.

Defect 3 is the same class as finding 88, one layer in: finding 88 was a quantity
computed and never printed; this is a quantity printed under a name that overstates
it. `collected: 1` on a row whose runner had reported six failures is not a wrong
number, it is a floor presented as a total, and the basis now travels beside it.

Defect 4's fix is an ordering, and the ordering is the point:

```python
if status != 0 and failed_count(output) > 0:
    return "tests_failed"
if collected == 0:
    return "no_tests_collected"
```

The failure evidence is consulted **first**, and it is consulted directly rather
than through a count derived from a slice of text.

### The field that carried the evidence was sized to exclude it

`output_tail` kept twelve lines. A vitest failure frame is nine lines -- the
`❯ file:line:col` header, the source excerpt with line numbers, the `^` caret, and
the blank separators -- and vitest prints *every* frame before the summary. Twelve
lines lands in the middle of the last frame and stops:

```
❯ test/check-readme-sample.test.ts:353:27
  353|     expect(result.status).toBe(0);
     |                           ^
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/6]⎯
```

That is a real captured tail of a row that failed **six tests**. The frame proves a
test ran; the summary is the count; twelve lines delivered the first and never the
second, so every parser that prefers the summary fell back to a floor. It keeps
forty now, which is the field finally being sized against the thing it has to
contain rather than against a wish for a small diff.

### Verified against the bytes, not against a paraphrase

The captured tails are committed verbatim, escapes intact, as
`packages/core/test/fixtures/gate-battery-ci-output.json`, and
`packages/core/test/gate-test-battery-ci-parsing.test.ts` replays them through the
shipped helpers by lifting the functions out of the file and executing them. A
fixture paraphrased into TypeScript string literals would have been written by the
same hand as the fix, and would tend to be the shape the fix handles.

Each of the four behavioural assertions was checked against the pre-fix parsers on
those bytes, and all four fail there:

| assertion | pre-fix | post-fix |
| --- | --- | --- |
| `failing_tests` finds an ANSI-wrapped frame | 0 names | 1 name |
| `failed_count` without a summary in the text | 0 | 1 |
| verdict on the exit-1 row | SURVIVED | CAUGHT |
| `diagnosis` of a real failure | `no_tests_collected` | `tests_failed` |

Replayed across all 25 captured rows, the pre-fix code reaches `caught 0` and the
hardened code reaches `caught 24` -- reproducing the CI report and then exceeding
it, on the same bytes.

### A test that broke, and what it was actually asserting

`gate-test-battery-exclusion.test.ts` lifted `collected_count` out of the file by
slicing between two neighbouring definitions:

```ts
const start = source.indexOf('def collected_count(');
const end = source.indexOf('\ndef diagnosis(');
```

That is a slice between two named neighbours, not a definition, and inserting
`collected_basis` between them made it swallow the new function whole -- and cut
`collected_count` off from `failing_tests`, which its new fallback calls. The
generated script raised `NameError`, printed nothing, and the assertion compared an
empty string. **An output-less subprocess reads as a wrong answer, not as a broken
harness**, which is why it took a moment to see. It extracts by name now, and lists
its dependencies rather than assuming them.

### The result

| | CI `d33b4e47a` | local, after |
| --- | --- | --- |
| caught | 0 | 24 |
| survived | 24 | 0 |
| redundant | 1 | 1 |
| `diagnosis` labels | `no_tests_collected` ×25 | `tests_failed` ×24, `tests_passed` ×1 |
| `collected_basis` | absent | `summary` ×25 |
| runner restore | — | asserted, `RC=0` |

The local run now reports `collected_basis: "summary"` on all twenty-five rows,
with exact counts, and `collected=9` for the README file that the CI tail could
only undercount as 1. That is the report doing what it was built to do: the field
that was added to make a verdict explicable is, two rounds later, the field that
made its own earlier value legible as a floor.

### The lesson

**A parser has to be written against the bytes the producing environment emits, and
"it works here" is not evidence about there.** The mechanism had been invisible for
three rounds for a different reason each time: the log could not be read, then the
report was readable and mute, then the report did not exist. This time the report
existed, was readable, and was believed -- and the belief was wrong because the
code had read a terminal's text on a machine that does not have one.

The narrower lesson is about fallbacks. **A fallback that turns 0 into a non-zero
number is not necessarily an improvement**: defect 1's fix produced defect 3, and
defect 3 produced defect 4. Each step made the number look more plausible while
moving it further from what it claimed to be. The repair was not a better fallback
but *labelling the evidence*, so that a floor is never read as a total.

## Finding 91: two successful M1 runs were never read, and reading them settles four rounds of hypotheses

Four rounds -- findings 62, 64, 65 and 78 -- closed by proposing an experiment for the
next round. Findings 62 and 64 proposed prompt variants and measured them. Finding 65
built the `missClassification` instrument and named the question it would answer.
Finding 78 measured M1's ceiling and re-classified the blocker as model capability.

**Two of those runs had already happened and nobody read them.** Run `36240660455`
(`9932e766c`) and run `36242319547` (`567118aea`) both completed `success` on
2026-09-26, after `9c72a56` -- the revision finding 64 read -- and both carried the
full annotation set: headline, per-field, miss classification, and per-row miss detail.
`09-推进进度追踪.md` recorded `9c72a56` as the latest reading. The instrument finding 65
built was reporting from the moment it shipped, into a channel that is readable, and the
readings sat uncollected for two revisions.

### The three readings, side by side

| run | sha | `strict` | `type` | `category` | `component` | miss classification |
| --- | --- | --- | --- | --- | --- | --- |
| `36229820836` | `9c72a56` | 1/19 | 6/19 | **11/19** | 3/19 | not yet emitted |
| `36240660455` | `9932e766c` | 0/19 | 4/19 | **11/19** | 4/19 | wrong value 38, omitted 0 |
| `36242319547` | `567118aea` | 0/19 | 5/19 | **11/19** | 2/19 | wrong value 39, omitted 0 |

### What the two unread runs establish

**1. `category` is bit-stable and `type` is not.**

| field | three values | spread |
| --- | --- | --- |
| `type` | 6, 4, 5 | **2 samples (10.5 pp)** |
| `category` | 11, 11, 11 | **0** |
| `component` | 3, 4, 2 | **2 samples (10.5 pp)** |

`category` scored 11/19 three times, across three revisions of the prompt and the
pipeline. `type` and `component` each moved by two samples. The stability is not
"the model is consistent" -- it is that **the same eleven samples are being answered
correctly each time**, which is what makes the miss list worth reading rather than
re-running.

**2. The miss is never an omission.**

```
wrong value 38, omitted 0, samples with >= 1 miss 19      (9932e766c)
wrong value 39, omitted 0, samples with >= 1 miss 19      (567118aea)
```

Finding 65 built this distinction to separate "the model answered incorrectly" from
"the model declined to answer", because they have different repairs -- a shape rule for
the first, a required-fields instruction for the second. **Every one of the 39 misses is
a wrong value. Not one is an omission.** `samplesWithMisses` is 19 of 19, so the
required-fields instruction has nothing to fix.

### What the miss detail shows, and it is not what any prior round assumed

The per-row detail names both sides. Reading the 14 `type` misses in full:

| expected | the model answered | relationship |
| --- | --- | --- |
| `cpu-saturation` | `cpu-throttling` | the same fault, named by effect rather than by cause |
| `memory-leak` | `unbounded-session-cache-growth` | a leak, described by its mechanism |
| `disk-full` | `disk-space-exhaustion` | **exact synonym** |
| `network-loss` | `egress-interface-packet-loss` | **exact synonym, more specific** |
| `pod-kill` | `kubelet-eviction` | the event, named by its trigger |
| `container-crash` | `ffmpeg-native-segmentation-fault` | the crash, named by its cause |
| `redis-latency` | `redis-single-thread-cpu-saturation` | the latency, named by its cause |
| `kafka-consumer-lag` | `synchronous-outbound-call` | the lag, named by its cause |
| `database-connection-pool-exhaustion` | `connection-pool-deadlock` | same pool, cause versus state |
| `regex-catastrophic-backtracking` | `catastrophic-regex-backtracking` | **word order only** |
| `config-mismatch` | `stale-config-key` | the mismatch, named by its instance |
| `upstream-5xx` | `dependency-degradation` | the same event, a different abstraction level |
| `library-version-incompatibility` | `dependency-api-incompatibility` | the same incompatibility, another noun |
| `replica-lag` | `replication-apply-bottleneck` | the lag, named by its cause |

**Eight of the fourteen share at least one token with the expected value, and one is a
word-order permutation.** Not one is a different fault.

And the `category` misses show the same thing one level up:

| expected | the model answered | count |
| --- | --- | --- |
| `middleware` | `resource` | **4** |
| `resource` | `code` | 1 |
| `runtime` | `resource` | 1 |
| `runtime` | `dependency` | 1 |
| `code` | `config` | 1 |

`middleware` is the expected category four times and the model answered `resource` all
four times. The middleware samples are `redis-latency`, `kafka-consumer-lag`,
`database-connection-pool` and `mysql-replica-lag` -- all of which *do* manifest as host
resource pressure, which is exactly the observable the incident text describes. The
model classifies **where the symptom appeared**; the ground truth records **which tier
owns the fault**.

### Why this is a finding about the benchmark, not about the model

The two fields are scored by exact equality after `normalizeFaultType`, which folds case,
whitespace and separators -- and `extraction-scoring.ts` says in its own words that it
refuses a synonym table:

> A category is folded the same way, with no synonym table -- deciding that `net` means
> `network` is a judgement, and `importer.ts` deliberately leaves that judgement to the
> H3 reviewer.

That refusal is correct and should stay. **The finding is not "the comparator should
accept synonyms."** It is that the *ground truth's granularity* and the *model's
granularity* are different, and under exact equality that difference is scored as error
regardless of which one is right. The evidence is that the disagreement is systematic and
directional: the answer is consistently a **mechanism, a cause, or a more specific
instance** of the expected abstraction, and never a neighbouring fault.

That distinction decides what a fix would even be, and it rules out the two the recent
rounds were considering:

- **Not a prompt defect.** Findings 62 and 64 tried stating the format, and the format is
  not what differs -- the model produces a well-formed slug. It produces the *wrong
  altitude* of slug, and no prompt has told it which altitude the ground truth uses,
  because the ground truth does not state one.
- **Not a comparator defect in the sense of needing synonyms.** Accepting
  `disk-space-exhaustion` for `disk-full` is a judgement; the module is right to refuse
  it, and the judgement belongs to whoever owns the dataset.
- **It is a labelling-granularity question**, and unlike the two above it is answerable
  without another LLM run: the 39 miss rows are recorded, and each can be adjudicated
  as "the same fault at a different altitude" or "a genuinely different fault" by a rule
  that does not need the model in the loop.

### What this does not establish

- **That a coarser ground truth reaches 70%.** This is the same trap finding 78 was
  written to avoid. The 39 misses are *all* same-mechanism by inspection, but inspection
  is mine, and the adjudication has to be a rule over the recorded rows rather than a
  reading of them. Until that rule exists, "the labels are too fine" is a hypothesis with
  strong support, not a measurement.
- **How many samples the granularity actually costs.** 14 `type` misses is a count of
  misses, not a count of samples that would become `strict` hits. `strict` requires all
  three scored fields at once, and `category` at 11/19 caps it independently. The
  arithmetic has to be done over the per-sample cross-product, which the per-row detail
  now makes possible.
- **Whether the model or the ground truth is the one to change.** Both are defensible and
  it is a product decision. What is not defensible is continuing to treat it as a model
  capability gap, which is how finding 78 re-classified it.

### The process defect, which is the same one as finding 90 one level out

Finding 90 established that a parser must be written against the bytes the producing
environment emits. This is the adjacent failure: **an instrument can be correct,
readable, and reporting, and still not read.** Finding 65 built `missClassification` and
wired it to an annotation precisely so the question of *why* fields miss would be
answerable. Two runs emitted it. The gap was not the instrument, the channel, or the
format -- it was that no step in the loop reads back the annotations of runs that
already completed, so "what does the latest run say" was answered from a document
rather than from the runs.

The repair is not a code change. It is that **the reading is taken from the runs, not
from the last document that mentioned a run** -- and the first application of that rule
is this finding.

---

## Finding 92: the two readings of the `type` misses disagreed, and the transcript was the wrong one

Finding 91 closed by naming a reconciliation it could not do from where it stood. The
`type` misses had been read twice and the two readings did not match:

- **The live annotation of run `567118aea`**, read directly: **14** `type` misses.
- **`scripts/probe-type-misses.mjs`**, whose output was quoted as the current figure:
  **15** `type` misses, and it printed `different-mechanism 6` where the first reading
  called all 14 the same mechanism at a different altitude.

Finding 91 recorded the discrepancy and refused to resolve it by preference, which was
right. What it could not say -- because it had not done it -- is **which of the two was
reading the run**, and the answer turns out to settle the question and expose a second
defect underneath it.

### The transcript was exact, against a different run

`probe-type-misses.mjs` carried `RECORDED_TYPE_MISSES`, fifteen rows, and its own
docstring named the run: *"the fifteen `type` misses from run `9932e766c`"*. That claim
is **true**. Re-derived from the annotation of `9932e766c`, the fifteen rows match the
transcription **byte for byte**, in order, with no difference in any field -- including
the awkward ones (`native-ffmpeg-segfault`, `synchronous-outbound-call-per-record`,
`replica-apply-thread-saturation`).

So nothing was mistranscribed. The defect is that the figure was **quoted as current**.
The two runs are one commit apart and both succeeded:

| run | sha | `type` | `category` | `component` | strict | `type` misses |
|---|---|---|---|---|---|---|
| `36240660455` | `9932e766c` | 4/19 | 11/19 | 4/19 | 0/19 | **15** |
| `36242319547` | `567118aea` | **5/19** | 11/19 | 2/19 | 0/19 | **14** |

The `type` set is not merely reworded between them. Three rows moved:

| sample | in `9932e766c` | in `567118aea` |
|---|---|---|
| `resource-memory-leak-recommendation.type` | *not a miss* | `memory-leak -> unbounded-session-cache-growth` |
| `code-null-dereference-reporting.type` | `null-dereference -> null-pointer-dereference` | *not a miss* |
| `code-unhandled-exception-export.type` | `unhandled-exception -> csv-writer-typeerror` | *not a miss* |

And eight of the rows present in both carry **different answers**:

| sample | `9932e766c` | `567118aea` |
|---|---|---|
| `network-loss-payment-gateway` | `egress-packet-drop` | `egress-interface-packet-loss` |
| `runtime-container-crash-loop-media` | `native-ffmpeg-segfault` | `ffmpeg-native-segmentation-fault` |
| `middleware-redis-latency-cache` | `redis-command-thread-saturation` | `redis-single-thread-cpu-saturation` |
| `middleware-kafka-consumer-lag` | `synchronous-outbound-call-per-record` | `synchronous-outbound-call` |
| `code-slow-regex-api-gateway` | `regex-backtracking` | `catastrophic-regex-backtracking` |
| `dependency-upstream-5xx-pricing` | `upstream-dependency-outage` | `dependency-degradation` |
| `dependency-version-incompatibility-shipping` | `breaking-dependency-api-change` | `dependency-api-incompatibility` |
| `middleware-mysql-replica-lag-analytics` | `replica-apply-thread-saturation` | `replication-apply-bottleneck` |

Five answers are stable across both runs (`cpu-throttling`, `disk-space-exhaustion`,
`kubelet-eviction`, `stale-config-key`, `connection-pool-deadlock`). Eight of thirteen
shared rows changed. That is not sampling noise on a fixed question; it is a different
question or a different prompt, and the answers moved with it.

**The conclusion finding 91 needs is therefore the one its own data supported.** The
`type` reading that matters is `567118aea`'s, and the `type` figure is **14, not 15**.

### The separator changed between the two runs, and both are in the record

Re-deriving the rows exposed a second defect, and it is why the reconciliation could not
be done by re-reading the annotation naively.

`9932e766c` joins its rows with **a space**. `567118aea` joins them with **U+001F**.
That change is finding 70's fix and the reasoning in the workflow is sound: values
contain spaces, so a space join cannot be split unambiguously, and a whitespace split
manufactured rows reading `order-service -> order-service` -- two cases of the scorer
apparently marking a correct answer wrong.

Measured on `9932e766c`'s recorded body: splitting on spaces yields **56 tokens** where
the run published **38 rows**. The 18 extra tokens are the tails of multi-word values --
`network`, `path`, `node`, `egress`, `interface`, `native`, `binding`, `Redis`,
`service`, `database`, `client`, `pool`, `writer`, `rule`, `ConfigMap`, `provider`,
`applier`, `thread`.

Both separators still have to be readable, because the space-separated runs are already
published and immutable and they are the only evidence of what the model said before the
change. The space form is recovered by an anchor rule rather than by a split: a row
begins with `<slug>.<field>:` where `field` is one of four known names, so a token that
matches the anchor starts a row and a token that does not is a continuation. Rejoined on
that rule, all 38 rows come back with the multi-word values intact --
`cart-to-inventory network path`, `billing service database client pool`,
`order-service ConfigMap`.

**The rule is decidable but not sound**, and the difference is stated in the module
rather than glossed. It fails on an `actual` that itself begins `<slug>.<field>:`. The
recorded run contains no such answer, so the limit does not bite on the evidence in
hand -- but the limit is the reason the separator was changed, so it is asserted rather
than commented.

### The classifier's partition is not the disputed one, but the *count* was

Re-running the classifier over the correct run:

| run | misses | `form-variant` | `shares-token` | `different-mechanism` | over-specified |
|---|---|---|---|---|---|
| `567118aea` (correct) | **14** | **0** | **8** | **6** | 7/14 |
| `9932e766c` (what was quoted) | 15 | 0 | 9 | 6 | 11/15 |

Two things follow, and they point in opposite directions from finding 91's framing.

**`form-variant 0` holds on both runs.** No answer was rejected that the normalizer
should have accepted. The scorer is not the defect. This is the one claim all three
readings agree on, and it is the claim that matters most, because a form variant would
be a bug in this repository.

**`different-mechanism 6` also holds on both runs**, and it is not in tension with
"all 14 are the same mechanism at a different altitude" -- it is a disagreement about
what the three classes mean. The classifier's `different-mechanism` means *shares no
token with the expected slug*; `pod-kill -> kubelet-eviction` shares nothing lexically
and is still the same incident at a different altitude. So the classifier's 6 does not
contradict finding 91's adjudication, and finding 91's adjudication does not overrule
the classifier's 6. They answer different questions:

- **The classifier** answers *can the normalizer reach this?* -- a lexical question, and
  the one this repository can act on.
- **Finding 91's adjudication** answers *is this the same fault?* -- a semantic question,
  and the one a ground-truth change would need.

Reporting either as the other is the error. The classifier's output must not be read as
a count of genuinely different faults, and finding 91's adjudication must not be read as
a normalizer verdict.

### The assertion that was pinning the defect

Fixing the reading turned up a test that was holding the old figure in place. In
`type-miss-probe.test.ts`:

```
expect(longer).toBeGreaterThan(classified.length / 2);
```

This holds for `9932e766c` (11 of 15) and **fails for `567118aea`** (7 of 14 -- exactly
half). It looked like a property of the model and was a coincidence of the run it was
read from. The claim that survives both runs is the *direction*: over-specification
outnumbers under-specification. That is now what is asserted, and it is asserted **per
run**, so a future run that inverts the direction fails rather than being explained away.

The same test required the probe's source line to contain the literal `9932e766c`. That
assertion was pinning the hard-coded run. It now requires the source line to name the run
that was **asked for**, which is the property that keeps a figure quotable.

### What was built, and what it does not claim

`packages/core/src/fault/miss-detail.ts` reads the annotation body into rows. It is the
first thing in this repository that *reads* the channel rather than describing it, and
the gap it closes is not cosmetic: the only previous consumer carried a copy of one run's
contents instead of a reader, because the channel lives in CI and reading it needs a
token, a run id, and a check-run lookup.

`scripts/probe-type-misses.mjs` no longer hard-codes its input. It reads the recorded
annotation through `parseMissDetail`, takes the run as a parameter (`--run`, default the
most recent), and names the run in its output. The two recorded runs are both readable
and both asserted.

`packages/core/test/fixtures/miss-detail-567118aea.txt` and
`miss-detail-9932e766c.txt` are the verbatim annotation bodies, escapes intact -- one
U+001F-joined, one space-joined. They are the evidence, and they are in the repository so
the reading can be re-derived without a token.

**It does not claim the adjudication rule finding 91 asked for.** That rule decides "the
same fault at a different altitude" versus "a genuinely different fault", and this
finding does not build it -- it establishes what the rule must be applied to, which is
14 rows from `567118aea` and not 15 from `9932e766c`. Building the rule over the wrong
row set would have adjudicated a run nobody is discussing.

**It does not claim the granularity costs anything.** 14 `type` misses is a count of
misses. `strict` needs all three scored fields on one sample, and `category` at 11/19
caps `strict` independently of `type`. The per-sample cross-product is now computable
from the recorded rows; computing it is the next step, not this one.

### The process rule, applied and now encoded

Finding 91 stated the rule and applied it once, by hand. This finding is the second
application and it is enforced:

- **The reading is taken from the runs, not from the last document that mentioned a
  run.** The transcription was exact and the figure was still wrong, because exactness
  is relative to a subject and the subject had moved.
- **A figure carries its run.** `recordedTypeMisses(run)` takes the run as an argument;
  the probe prints the run it read; the tests assert per run. A figure with no run
  attached cannot be checked, and one with the wrong run attached is worse than none.

The three-line version, for the next round: **when two readings disagree, do not
reconcile them by argument. Find which one is reading the thing, and delete the other.**

---

## Finding 93: the battery's own injections went blind, and one of them had been blind all along

Finding 92 removed `RECORDED_TYPE_MISSES` from the probe. Seven injections in
`scripts/injection/type-miss-probe.py` were anchored on that array's rows, and an
injection whose anchor has been deleted does not fail -- it reports **INERT**, which the
battery counts as a run and does not count as a pass. CI failed on `95cb64e64` at step
15 with exit 1 and no report; the local run reproduced it exactly: `7 caught, 0 survived,
7 inert`, every INERT line reading `anchor not found: "  ['network-loss-payment-gateway',
'network-loss', 'egress-packet-drop`.

That is the battery behaving correctly. It is the same failure this project has now seen
three times in a row -- a figure outliving the thing it described -- and this time the
instrument caught itself.

### The data moved, so the injections followed it

The recorded misses now live in `packages/core/test/fixtures/miss-detail-567118aea.txt`,
which is the annotation body of a named run. `run_probe` therefore takes two inputs --
the probe source and the fixture -- and restores both in a `finally`, because the report
has to be readable during a run that exits non-zero.

Each paired injection now **declares** which file its second edit lands in:

```python
target = 'fixture' if len(entry) < 6 else entry[5]
```

Written down rather than inferred. An inferred target would be a guess, and this
battery's entire history is of injections that silently tested nothing because an anchor
moved; inferring the file would let a pair land in the wrong one and still look applied.
Four of the seven retargeted injections turned out to be pure-data -- K, L, and the
already-data J -- and those carry `mutate = None`. `main` had to stop calling
`mutate(probe_text)` unconditionally, and had to stop running the `mutated == probe_text`
early-exit for them: that guard asks whether the *rule* changed, which is the wrong
question for an injection whose whole edit is in the data. It would have reported INERT
on a correct injection.

### The third verdict: BLIND

Retargeting K is where this finding became worth writing. K edits the recorded answers.
The first anchor renamed `cpu-saturation>cpu-throttling` to `cpu-load>cpu-throttling` --
two strings that share `cpu`. The second renamed `disk-full>disk-space-exhaustion` to
`disk>disk-exhaustion` -- two strings that share `disk`. In both cases the edit landed on
a row that was **already in the class the edit was meant to move it out of**. The
partition stayed `0/8/6`, the requirement went False, the exit code was non-zero, and the
battery printed:

```
CAUGHT   K. data: ...
         (form-variant 0, shares-token 8, different-mechanism 6, total 14, ...)
```

`CAUGHT` with an identical partition. The requirement had been falsified by something
other than the mechanism under test, and the run looked like coverage it did not have.
This is the same defect as INERT, arriving by a different route, and the battery had no
name for it.

It does now:

```python
elif (
    data is not None
    and not edits_source
    and result["counts"] == BASELINE["counts"]
    and result["total"] == BASELINE["total"]
):
    print(f"BLIND    {name}")
    blind += 1
```

Scoped to data-only injections, because that is where "the partition must move" is the
whole point of the edit. A *paired* injection like B changes the classifier and the data
together; its requirement is about the classifier, and the partition is under no
obligation to move. B failed the first run of this check for exactly that reason, and
failing a correct injection is how a check gets deleted, so the scope is part of the fix.

Verified load-bearing rather than asserted: with K re-anchored to a value that cannot move
its class (`kubelet-eviction` -> `kubelet-oom-eviction`, still sharing no token with
`pod-kill`), the battery reports `13 caught, 0 survived, 0 inert, 1 blind` and **exits 1**.

### K watches the class the row leaves

A within-partition edit can only be observed in the class the row **left**, because the
three classes are a partition over the 14 rows: a row can only leave a class by arriving
in another, and the arriving class grows by exactly the one that left. So a single class
count cannot see a between-class move *in general*, and the only way a single-count
requirement works is if it is the losing class. K's first shape watched the gaining class
and reported SURVIVED, correctly -- the injection was wrong, not the probe.

K is now anchored on a row genuinely in the different-mechanism class.
`pod-kill` / `kubelet-eviction` share no token, so this is the real thing:

```python
lambda d: rename(
    d,
    "runtime-pod-kill-user-profile.type:pod-kill>kubelet-eviction",
    "runtime-pod-kill-user-profile.type:pod-kill>kubelet-pod-eviction",
),
```

and the requirement is the losing count: `different-mechanism == 6`. The run reports
`0/9/5` and the count moved. Both wrong attempts are recorded at the anchor rather than
deleted, because "this anchor was chosen by reading the two strings instead of the
classifier's output for them" is the reusable lesson and it is invisible in a diff that
only shows the final anchor.

The six real different-mechanism rows are `memory-leak`, `pod-kill`, `container-crash`,
`kafka-consumer-lag`, `upstream-5xx` and `replica-lag`, read from the classifier and not
inferred. That list is in the comment because the next person to write an injection here
will need it and will otherwise make attempt 2 again.

### What changed

| | before | after |
|---|---|---|
| injections green | 7 caught / 7 inert | **14 caught / 0 survived / 0 inert / 0 blind** |
| verdicts | CAUGHT, SURVIVED, INERT | CAUGHT, SURVIVED, INERT, **BLIND** |
| `run_probe` inputs | probe source | probe source + annotation fixture |
| pair target | implicit (source) | declared per entry |
| CI step name | no survivors, no inert | no survivors, no inert, **no blind** |

### What this does not claim

**It does not claim the other batteries have no blind injections.** The BLIND check was
added to this battery because this battery is where the defect was found. Whether
`inject-m1-ceiling.mjs`'s battery or the gate battery can report BLIND depends on whether
their injections are anchored on data that can be edited without moving the observable;
that is unmeasured, and the honest reading is that the other batteries are now suspect in
a way they were not before.

**It does not claim K's property was previously covered.** K reported SURVIVED for one
anchor and CAUGHT-for-nothing for two others. The property "a row that becomes reachable
leaves the unreachable class" had no passing injection before this commit.

**It does not claim the retargeting was mechanical.** Four of the seven kept their edit
verbatim and gained a `data` slot. K was rewritten, because its original property turned
out to be unsatisfiable in the form it was stated. Two were already data-only. The count
of injections is unchanged at 14, which is a coincidence and not a result.

## Finding 94: the adjudication rule is a measurement now, and it says nine of fourteen rather than fourteen

Finding 91 declined to claim a result it had every reason to believe. Its own words:

> The 39 misses are all same-mechanism by inspection, but inspection is mine, and the
> adjudication has to be a rule over the recorded rows rather than a reading of them.
> Until that rule exists, "the labels are too fine" is a hypothesis with strong support,
> not a measurement.

This finding is that rule, built and run against the fourteen `type` misses of run
`567118aea` (the corrected rows, not the transcript). It was written to confirm 91. It
falsified part of it, and the falsified part is the more useful result.

### A rule over two strings cannot answer a semantic question, and pretending otherwise would have manufactured the figure

The first design returned a boolean: reachable or not. That design is wrong before it is
written, because `different-fault` is a **decision** and `same-fault-different-altitude` is
**permission**. Two strings that share a morpheme *may* be the same fault at a different
altitude; they are not thereby *proved* to be. A binary verdict turns "these look related"
into "these are the same fault", which is exactly the step 91 refused to make by hand.

So the verdict has three values:

| verdict | means |
|---|---|
| `different-fault` | a **proof** of difference -- the two descriptions cannot be the same fault |
| `same-fault-different-altitude` | a **permission** -- a shared morpheme licenses relabelling, it does not require it |
| `undecided` | neither; the honest third value |

`undecided` is not a failure mode. It is the value that lets the rule report a limit
instead of a verdict, and on this dataset it is deliberately the value the rule **cannot**
assign to a real pair -- see below.

### Three implementations, two of which were wrong in instructive ways

**Suffix matching.** The first rule looked for a shared suffix, on the reasoning that
inflections share their ends. It reported `replica-lag` / `replication-apply-bottleneck` as
`different-fault`, because `replica` is a **prefix** of `replication`. The reasoning was
backwards: English inflects at the end but compounds and truncations do not.

**Naive prefix matching.** Switched to prefixes, floor of 3 characters. That reported
`config-mismatch` / `container-crash` as `same-fault-different-altitude`, on `con`. Three
characters is not a morpheme.

**Prefix that consumes a whole token or is at least five characters.** This is the rule
that survived:

```ts
function sharesMorpheme(a: string, b: string): string | null {
  const limit = Math.min(a.length, b.length);
  for (let length = limit; length >= 3; length -= 1) {
    const prefix = a.slice(0, length);
    if (!b.startsWith(prefix)) continue;
    const consumesAToken = length === a.length || length === b.length;
    if (consumesAToken || length >= 5) return prefix;
  }
  return null;
}
```

`config`/`container` share `con` and neither consumes a token, so they are different.
`replica`/`replication` is reached because `replica` **consumes a whole token** -- not
because of the length floor. `exhausted`/`exception` share `ex` and are different.

### The measurement: nine of fourteen, and the five are the interesting part

Run against the fourteen recorded rows, the rule reaches **nine** and leaves **five**:

```
adjudication (finding 94): same-altitude 9 | unreached 5 | undecided 0
```

The nine bases are, in output order, `cpu`, `disk`, `loss`, `redis`, `connection`,
`regex`, `config`, `incompatibility`, `replica` -- a list the test asserts exactly, so a
change to the classifier that moves any row shows up as a changed basis rather than as a
changed count.

The five the rule could not reach:

| expected | recorded | why no morpheme exists |
|---|---|---|
| `memory-leak` | `unbounded-session-cache-growth` | a leak *is* unbounded growth; different words for one mechanism |
| `pod-kill` | `kubelet-eviction` | eviction is the kubelet killing the pod; the mechanism is named from the other end |
| `container-crash` | `ffmpeg-native-segmentation-fault` | the crash is the SIGSEGV; the cause is a native fault |
| `kafka-consumer-lag` | `synchronous-outbound-call` | the lag is the *symptom*; the cause is the call blocking the poll loop |
| `upstream-5xx` | `dependency-degradation` | an upstream 5xx is how a degraded dependency presents |

Not one of these five shares **any substring at any length**. Their relationship is
semantic and no function over the two strings will find it. This is what finding 91 was
looking at when it said "same-mechanism by inspection" -- accurate, and only inspection
could see it.

**So the lexical half of 91's claim is 9 of 14, not 14 of 14.** The claim is not wrong; it
is narrower than it was stated, and the narrowness is now a number.

`unreached` is deliberately **not** `different-fault`. A pair the rule cannot reach has not
been proved different -- it has been proved unreachable *by this rule*. Reporting the five
as `different-fault` would have produced a clean, wrong figure; reporting them as
`undecided` would have hidden five genuine same-mechanism pairs behind a non-answer.
They get their own name and their own list.

### The cross-product cost, and the binding field is not the one 91 named

`strict` scoring needs every scored field on one sample, so the **lowest** per-field count
caps it. Finding 91 named `category` at 11/19. The general form says the minimum, and the
minimum is `component` at **2/19**:

| field | samples with a miss |
|---|---|
| `component` | 2 / 19 |
| `category` | 11 / 19 |
| `type` | 14 / 19 |

`crossProduct` computes this rather than restating it, and skips any field with
`total === 0` -- `description` is optional, and an unscored field's `0` hits would become
the binding constraint and cap `strict` at zero. That skip is two lines and it was the only
uncovered region in the module; it now has two tests rather than an ignore comment.

Samples blocked by a miss the rule calls `different-fault` are counted separately and
cross-checked against the `unreached` set, so a sample cannot be reported as blocked for a
reason the rule did not actually establish.

### The battery, and the two ways this injection set was wrong before it was right

Three new injections (M, N, O) target the rule module. They are new because the module is
new, and a module with no injection is a module whose behaviour is asserted rather than
tested. The run is now:

```
battery: 17 caught, 0 survived, 0 inert, 0 blind
source restored: identical to backup (probe, fixture, rule)
```

**M's anchor was a line range, and it ate the wrong thing.** The first version addressed
`src_lines(t, 171, 181)`. A later edit moved the function by one line, so the range spanned
the `Adjudication` type declaration instead, the build failed, and the mutation was left on
disk with nothing to restore it -- because the write and the build both ran *before* the
`try`. `packages/core/src/fault/miss-adjudication.ts` was corrupt across a whole run, and
the corruption surfaced as `SyntaxError: Unexpected token '|'` inside the probe. Fixed in
three places: the anchor is now by **name** (`body_of(text, "function sharesMorpheme(")`),
every mutation and the build moved **inside** the `try`, and the restore **recompiles**
rather than writing back a saved `dist` -- a saved snapshot taken at entry faithfully
restores a tree that was already corrupt. Each file is then verified byte-for-byte, and the
run prints which of the three inputs it checked. This is finding 93's lesson generalised
from data anchors to source anchors: an anchor that moves must fail **at the anchor**.

**N was wrong twice, in the two ways that matter.** Its first version set the length floor
to 3 and **SURVIVED**. That survival is a real finding and it is kept: on these fourteen
rows the floor is **never the deciding factor**. `replica`/`replication` is reached by
consuming a whole token, and the five unreached rows share no prefix at any length, so
`length >= 3` and `length >= 5` produce identical output on this dataset. An injection
that changes it cannot be caught. The floor's effect is demonstrated where it can be --
the two constructed tests -- and the floor's weakness is recorded at the anchor rather than
papered over. N's replacement targets the branch those constructed tests *would* notice.

Its second version then reported **INERT** with:

```
-- the paired source edit did not apply: no function declaration starts with: 'function sharesMorpheme('
```

The entry was written as a five-tuple, so `main` defaulted its target to `'source'`, and a
lambda anchored on a function that exists only in the **rule** was applied to the probe
script. The printed name said "rule" and the edit went to the script.

The default was **kept** deliberately. Making the target mandatory is a one-line change
that removes the mistake and also removes the evidence that the battery reports it; every
`'rule'` and `'fixture'` entry now states itself, and the misroute is recorded at the
anchor. Both of N's failures were invisible in the injection's name, which is the property
the INERT accounting exists to make loud.

### What this changes for the next round

The `category` direction is now the live question, and it is a **systematic altitude
mismatch**: every `middleware` expected value is recorded as `resource`, 4 of 4. That is a
consistent off-by-one-altitude rather than fourteen independent adjudications, and it is
the next thing to measure with this rule rather than by reading rows.

### What this does not claim

**It does not claim the five unreached rows are different faults.** They are unreached by a
morpheme rule. Four of the five have a defensible same-mechanism reading and the fifth
(`container-crash` / native segmentation fault) is at minimum the same *event* at a
different altitude. The rule's output is `unreached`, which is a statement about the rule.

**It does not claim the nine are proved same-altitude.** The verdict is a permission. The
rule licenses relabelling; whether the relabelling *should* happen is a labelling decision
this finding does not take.

**It does not claim the length floor is tested.** It is not, on this dataset, and N's
survival is the evidence. The two constructed tests exercise it; the recorded rows do not.

**It does not claim the other batteries are safe.** Unchanged from finding 93: the BLIND
check and the name-based anchor exist in the type-miss battery, and whether
`inject-m1-ceiling.mjs`'s battery can report BLIND or can misroute a target is unmeasured.

## Finding 95: a config fault classified as middleware, because `flag` contains `lag`

Finding 94 closed by naming the next live question and it was specific: the `category`
direction showed "a **systematic altitude mismatch** -- every `middleware` expected value is
recorded as `resource`, 4 of 4." That claim was pursued, and it is false. It is 3 of 4. The
fourth `middleware` sample is not recorded as `resource` at all.

Chasing the disproof is what led to a production defect, and the defect was not in the
transcription. It was in `inferFaultCategory`.

### The defect, stated as an input and an output

```ts
inferFaultCategory('feature-flag-misconfiguration')  // ->  'middleware'
```

The slug names a configuration fault. It contains `flag`, which contains `lag`, and `lag` is
a `middleware` keyword. The middleware row is tested before the config row, so the earlier
row won. The mechanism could not tell that `lag` was a *part of* `flag` rather than a word in
its own right, because it was not asking about words:

```ts
if (keywords.some((k) => normalized.includes(k))) {   // the whole slug, as a letter sequence
```

`String.includes` answers "does this sequence of characters appear anywhere in that sequence
of characters". That is a different question from "does this slug use this word", and the gap
between the two questions is the entire defect.

### The blast radius is not one row

The obvious reading is that this is a bug about `lag` and `flag`. It is not, and measuring it
is what establishes that. **32 of 40 adversarial English words produce a wrong category**:

| word | matches | wrong category | word | matches | wrong category |
| --- | --- | --- | --- | --- | --- |
| `planet` | `net` | network | `debugger` | `bug` | code |
| `magnet` | `net` | network | `ladybug` | `bug` | code |
| `cabinet` | `net` | network | `dropdown` | `drop` | network |
| `tenet` | `net` | network | `backdrop` | `drop` | network |
| `room` | `oom` | resource | `envelope` | `env` | config |
| `zoom` | `oom` | resource | `environment` | `env` | config |
| `bloom` | `oom` | resource | `adbc` | `db` | middleware |
| `member` | `mem` | resource | `dbnull` | `db` | middleware |
| `remember` | `mem` | resource | `skill` | `kill` | runtime |
| `aggregation` | `lag` | middleware | `flagship` | `lag` | middleware |

Any English word containing `net`, `oom`, `mem`, `lag`, `db`, `env`, `bug`, `drop` or `kill`
is classified, and most of the words that contain those trigrams have nothing to do with the
category they trigger.

The damage is not local, because `category` is not a display field. It selects the row of the
validity gate's mechanism table that decides **which telemetry would evidence a fault**, and
it is exported into the benchmark artefacts as `scenario_class`, `fault_taxonomy` and
`fault_category`. A misread category is a case verified against the wrong expectation.

### Four match forms, and why each one is there

The fix asks about words. A keyword has to sit on a word boundary, and four forms are
accepted -- each because a real fault type needs it, not because it seemed reasonable:

| form | example | why it cannot be dropped |
| --- | --- | --- |
| exact | `kafka-lag` → `lag` | the base case |
| plural | `dependencies` → `dependency` | `dependency`+`s`, and `dependency` is 10 characters |
| prefix | `eviction` → `evict` | `evict`+`ion`; `eviction` is not the plural of `evict` |
| negation infix | `misconfiguration` → `config` | `config` is **not** a prefix of `misconfiguration` |

The negation form is the one that had to be discovered rather than assumed. The first attempt
at the fix reasoned that `config` is a prefix of `misconfiguration` and therefore needed no
special case. It is not: `mis` precedes it. `startsWith` cannot see an infix, so the form
exists as an explicit clause over a closed list of prefixes (`mis`, `non`, `un`).

**`de` is deliberately not in that list**, even though it is a real English prefix, because
`de` + `bug` is `debugger` -- a false positive -- and no fault type in the corpus needs it. A
prefix list that is closed is only useful if every member earns its place.

### Both length floors are load-bearing, and the collisions are concrete

```ts
const MIN_PREFIX_LENGTH = 5;
const MIN_PLURAL_LENGTH = 4;
```

**The 5-character prefix floor** stops `mem`⊂`member`, `mem`⊂`remember`, `mem`⊂`memento`,
`oom`⊂`room`, `oom`⊂`zoom`, `oom`⊂`bloom`, and `net`⊂`planet`/`magnet`/`cabinet`/`tenet`. Five
is long enough for every collision above and short enough that `evict` still reaches
`eviction` and `config` still reaches `configuration`.

**The 4-character plural floor** stops `db`+`s` from matching an unrelated `dbs` while leaving
`dependencies` reachable from `dependency`.

There is a limit worth stating plainly: `memory` is six characters, so the prefix form still
reaches `memoryless` and classifies it `resource`. That is **correct** -- `memoryless-pool` is
a memory fault -- and it is the one adversarial survivor, which is why the fix reduced false
positives from 32 to **1** rather than to 0. A classifier that named no category for
`memoryless-pool` would be worse, not cleaner.

### Restoring the word boundary exposed a second defect, in the table's order

With the matcher fixed, `inferFaultCategory` agreed with the golden dataset on 16 of 19 types.
The two residual misses are separate defects, and neither was caused by the substring bug:

- **`regex-catastrophic-backtracking` → `unknown`.** The `code` row had no keyword this type
  could reach. `unknown` is the honest answer for a type the table has never seen and a false
  answer for a type it has, and it is not harmless: `expectedSignalsFor` reads `unknown` as
  **unverifiable**, so such a case is exempted from mechanistic checking rather than failing
  it. Fixed by adding `regex` and `backtracking` to the `code` row.
- **`redis-latency` → `network`.** This one is the interesting one. `latency` is a `network`
  keyword and the network row was tested before middleware, so the *mechanism* outranked the
  *subject*. The substring matcher had been returning `middleware` for this input by accident
  -- the slug contains `redis` -- so removing the accident revealed that the ordering had never
  been deliberate.

The ordering question is decided by the dataset, not by preference. `redis-latency` is
`middleware` and `network-delay` is `network`: the same mechanism, different categories. Keyword
presence alone cannot separate them, so the row holding the subjects is tested first. The
`middleware` row moved above `network`, and the same ordering that buries the symptom also
keeps `kafka-consumer-lag` and `replica-lag` out of the network row.

The final measurement: **19 of 19 golden types, 0 of 22 adversarial false positives.**

### The second defect: a docstring asserting a guard that did not exist

`packages/core/src/gates/validity.ts` claimed, of the mechanism table:

> The table is total over `FAULT_CATEGORIES` and both directions are asserted in the test
> suite, so adding a category to the IR without deciding what it moves is a red suite rather
> than a silent gap.

There was no such assertion. What existed, in `validity.test.ts`, was a cross-check between
`FAULT_EXPECTATIONS` and `FAULT_CATEGORIES` -- a **different pair**, proving the table is total
over the IR union. Nothing connected the table to the taxonomy in `fault/collector.ts`. The two
could disagree about which category a fault type belongs to and every suite in the repository
would stay green while a case built by the collector was verified against a row chosen for a
different category.

This is the class of defect finding 94 warned about from the other end: a comment describing a
property is not evidence the property holds. It is **fixed by making the claim true** rather
than by weakening the docstring. `validity.test.ts` now reads the golden dataset, runs every
type the dataset builds cases from through `inferFaultCategory`, and requires the answers to
land inside the table -- with a `unknown` check, because `unknown` is a legal answer and a dead
end for the gate.

### Nothing observed the classifier, which is why this shipped

The `category` defect could have shipped **any** answer. `probe-type-misses.mjs` reads a
recorded annotation's `type` field and never calls `inferFaultCategory`. The repository's
whole battery apparatus was pointed at the *transcription* and none of it was pointed at the
*classifier*.

So the observation point is new: `scripts/probe-category-inference.mjs` runs the classifier
across the 19 golden types -- read from `samples.json` rather than retyped, so the probe cannot
drift from the data -- plus 22 adversarial words each paired with the keyword it wrongly matched.
The adversarial table is the part that has teeth. The golden types establish that the classifier
still works; the adversarial rows establish that it works *for the right reason*.

Four injections were added to the type-miss battery against that probe. They were not written
blind, and three of them landed wrong before they landed right:

- **P** restores `normalized.includes(keyword)`, the exact defect. Its first version replaced the
  only call site of `keywordMatchesToken`, which left the function unreferenced and failed the
  build with `TS6133` -- caught, but caught at compile rather than at the requirement. The
  requirement was never evaluated, so the run said nothing about the adversarial table. Keeping
  the call behind `false &&` compiles and measures the defect. Measured: **21 of 22 adversarial
  false positives**.
- **Q** drops `MIN_PREFIX_LENGTH` to 0, and **R** empties the negation loop, and **S** moves the
  network row back above middleware. R and Q hit the same `TS6133` trap as P and needed the same
  treatment, which is now recorded at each anchor rather than rediscovered.
- **S** is the one that pins the *ordering* rather than the matcher, and it is caught by the
  golden agreement count because `redis-latency` is one of the 19.

P's requirement is deliberately on the adversarial count and not the golden count: the substring
matcher still gets 18 of 19 golden types right, so the golden figure **cannot separate the two
implementations**. An injection that only moved `goldenAgreements` would be measuring the part of
the classifier that was never broken.

Battery result: **21 caught, 0 survived, 0 inert, 0 blind**, exit 0, and now all **four** inputs
restored byte-for-byte -- the restore previously named three, and `collector.ts` would have been
a mutated source tree invisible to the check. The classifier baseline prints in the battery
header next to the transcription baseline, so both instruments are visible in the same run:

```
baseline: 14 misses -- form-variant 0, shares-token 8, different-mechanism 6, over-specified 7
classifier: 19 golden types -- 19 agree, 0 miss; 22 adversarial words -- 0 false positives
```

### Finding 51 predicted this, and it still stands

Finding 51 already rejected keyword-to-category inference as unsound in principle:

> `parseFaultSpec` infers a category from a fault type, and the inference is a keyword match, so
> `io-hang` is classified `resource` only because `io` is in the resource row -- a fault that
> jams a disk queue and a fault that burns CPU are not the same experiment.

**This fix does not answer that.** It makes the inference fire where a **word** is present
instead of where a **letter sequence** is, which is a strict improvement and not a justification.
The principled answer remains the one finding 51 implies: a fault type that does not name its
category should be required to state it. What this fix buys is that the inference is now wrong in
a way that can be seen and argued with, rather than wrong in a way that depends on spelling.

### Coverage

`packages/core/src/fault/collector.ts`: **100 / 100 / 100 / 100**. Every one of the four match
forms, both length floors, and the multi-token clause is exercised, so the floors asserted in
prose above are also asserted by the coverage measurement rather than only by the argument.
Package total: **99.96 / 99.94 / 100 / 99.96**. Repository suite: **2776 passed in 99 files**,
14 of them new. Lint reports `ALL PROPERTIES HOLD`; core and CLI typecheck clean.

### What this does not claim

**It does not claim the classifier is now correct.** It claims the classifier no longer names a
category because of a letter sequence, and that this is measurable. Finding 51's objection is
untouched.

**It does not claim 19 of 19 means the taxonomy is right.** The dataset and the classified table
now agree; that is agreement between two artefacts this repository maintains, not evidence that
either matches reality.

**It does not claim the eight recorded `category` misses are explained.** Those are misses in a
model transcript, and how a model labels a fault is a different question from how this classifier
does. Finding 94's instrument is what answers that question, and it has not yet been pointed at
these eight.

**It does not claim `score/official.ts` is clean.** `keywordHit` there is the same substring
shape in AIOps2025 scoring, and it still needs its own reading.

**It does not claim the other batteries are safe.** Unchanged from findings 93 and 94: whether
`inject-m1-ceiling.mjs`'s battery can report BLIND or misroute a target remains unmeasured.

---

## Finding 96: the eight `category` misses follow a sentence that names a different category

Finding 95 closed by naming its own successor:

> Finding 94's instrument is what answers that question, and it has not yet been pointed at these
> eight.

This is that pointing. It produced a **new, measured finding**, and the finding is not the one I
expected to write.

### What was read

The eight recorded `category` misses were read from both annotations (`567118aea`, `9932e766c`)
and checked against `golden-master/fault-extraction/samples.json`:

| Sample id | Expected | Answered | Counter-evidence phrase in the text |
|---|---|---|---|
| `resource-memory-leak-recommendation` | resource | code | *(none)* |
| `runtime-pod-kill-user-profile` | runtime | resource | `well under the limit` |
| `runtime-container-crash-loop-media` | runtime | dependency | *(none)* |
| `middleware-redis-latency-cache` | middleware | resource | `not the bottleneck` |
| `middleware-kafka-consumer-lag` | middleware | code | `unchanged` |
| `middleware-database-connection-pool` | middleware | resource | `no long-running` |
| `code-slow-regex-api-gateway` | code | config | *(none)* |
| `middleware-mysql-replica-lag-analytics` | middleware | resource | `are current` |

Three properties were verified before the pattern was named. The eight misses are **identical in
both recorded runs**, so this is not run noise. **Every sample id resolves** in the golden dataset,
so nothing was read from a stale artefact. And the annotation's `expected.category` **matches the
dataset's own category 8 of 8**, so the ground truth is not two disagreeing sources.

### The finding

**Every missed incident contains a sentence naming a different category as the thing that is *not*
happening, and the model answers with that category.** `well under the limit` says the resource is
not the resource problem; the model answers `resource`. `not the bottleneck` says the middleware is
not the bottleneck; the model answers `resource`. The distractor is a *negation of a category*, and
the model reads the category and drops the negation.

Measured on the 19-sample golden dataset with a closed list of 10 phrases:

| Figure | Value |
|---|---|
| Samples carrying the phrase | 6 |
| Category misses reached by the phrase | **5 of 8** |
| **Precision** | **5/6** |
| **Recall** | **5/8** |

The confusion matrix, stated plainly, because it is what says the phrase carries signal:

```
has phrase & missed   5
has phrase & correct  1
no phrase & missed    3
no phrase & correct  10
```

### The confound, excluded by measurement rather than by argument

The obvious objection is that a longer incident text is harder, and longer texts are more likely to
contain any given phrase. That was tested rather than dismissed:

| Control | Result |
|---|---|
| Mean length with the phrase | 365 chars |
| Mean length without | 330 chars |
| Gap | 35 chars |
| Misses caught by a 400-char length threshold | **1 of 8** |

Text length is **not** the signal. A length threshold tuned to this very dataset reaches one of the
eight; the phrase reaches five. The gap in means is small enough that a length-based predictor
would have to be fitted to the eight to do anything, which is the definition of overfitting to the
outcome.

### It is recorded as a three-valued reading, for finding 94's reason

`assessCounterEvidence` returns `counter-evidence-present`, `counter-evidence-absent`, or
`not-assessable`. The third value exists for the same reason finding 94 introduced `undecided`: a
**missing input must not be reported as a clean reading**. Empty and whitespace-only text returns
`not-assessable`, and `counterEvidenceReport` counts such a sample in `gradedTotal` and on neither
side of the miss accounting -- it is not evidence either way, and counting it on one side would move
a figure on the strength of an input that was never read.

The phrase list is **closed**, 10 entries, and closed rather than a regex for the same reason
`NEGATION_PREFIXES` is closed: a pattern loose enough to catch prose catches prose.

### A correction to finding 94

Finding 94 recorded that the four `middleware` misses each answered `resource`. That is **false at
three of four**: `middleware-kafka-consumer-lag` was answered **`code`**. The correction is recorded
here because a finding that overstates its own regularity is how the next finding starts from a
wrong premise.

### Three injection lessons

The battery now carries 24 injections (A–V), all caught, **0 survived / 0 inert / 0 blind**. The
three new ones cost real mistakes before they worked, and each mistake is a distinct failure class:

**T — the compile-time trap, again.** The first version of the mutation renamed
`COUNTER_EVIDENCE_PHRASES` to `_UNUSED`. `tsc` rejected it three ways at once (`TS6133` on the
constant, the inferred parameter type it fed, and the `index.ts` re-export). It was **caught, but at
compile, with the requirement never evaluated** -- the same shape as finding 95's P/Q/R. The fix
empties the array in place, so the mutation is a legal program that the battery has to reason about.

**U — an unobservable branch cannot be defended.** Folding the third value into `absent` moved
**nothing**, because the baseline `notAssessable` was **0** on real data. The mutation would have
SURVIVED. It is now observable because the **probe itself** exercises the empty and whitespace
inputs, giving the baseline `notAssessable: 2`. This is finding 95's lesson N restated: a mutation
whose figure is never the deciding one tests the battery, not the code.

**V — requiring the wrong field.** The first requirement read `withPhrase` (6, unchanged) and would
have **SURVIVED**. Measured, the mutation moves `gradedTotal` 19 → 8. The requirement now names
`gradedTotal`. Same defect class as N, caught by measuring rather than by reading.

### A name collision the battery reported badly

`cat()` -- the classifier probe added in finding 95 -- and the probe's own `category` block, added
in this finding, both claimed the key `category`. The merge **silently overwrote** the block, and the
battery then failed with `KeyError: 'withPhrase'` rather than naming the collision. The classifier
merge is renamed `classifier`, with a comment at the merge site saying why. The battery should have
said "two writers, one key"; it said "missing key", and the difference cost a debugging cycle.

### Verification

`packages/core/src/fault/miss-distractor.ts`: **100 / 100 / 100 / 100** -- statements, branches,
functions, lines. Two branches reached only by the divide-by-zero guards (`withPhrase === 0`,
`missedTotal === 0`) were **uncovered at 90.5% branch** until tests were written for an empty
denominator; a `NaN` in a report compares false against every threshold a gate might use, so these
guards needed tests that assert a `NaN` is not produced, not merely that the code runs. Package
total: **99.96 / 99.94 / 100 / 99.96**. Repository suite: **2809 passed in 100 files**, 33 of them
new. Battery: **24 caught, 0 survived, 0 inert, 0 blind**, all five inputs restored byte-for-byte.
Lint: `ALL PROPERTIES HOLD`. Core and CLI typecheck clean. All injection scripts `py_compile` clean.

### What this does not claim

**It does not claim the phrase causes the miss.** The phrase is a **correlate** with measured
precision and recall, and the readings are named per row rather than asserted in bulk. The report
prints the phrase it actually matched -- for `middleware-redis-latency-cache` that is
`not the bottleneck`, not the `is normal` I had read by hand. The instrument names its own basis
rather than my reading of it.

**It does not claim the predictor is complete.** It reaches **5 of 8**. A report that rounded this
to "all eight" would be exactly the over-claim finding 91 refused to make by hand, and the
three unreached misses are printed by name rather than summarised away.

**It does not claim the dataset is fair to the model.** Whether writing a counter-evidence sentence
into the incident text and then grading a category is a well-posed task is a **labelling question**,
and it is not answered here. If it is unfair, the fix belongs in the dataset, not in the model.

**It does not claim anything about `inferFaultCategory`.** That was finding 95. This finding is about
a model transcript against a dataset, and the two must not be conflated: the classifier and the
model can both be wrong, and here they are wrong for unrelated reasons.

**`score/official.ts:900` is verified as a different case.** `keywordHit` there is the same substring
shape, but it is **correct use**: it is a *scoring* heuristic measuring lexical overlap between two
strings, and it makes no category claim, so a substring match is the intended semantics rather than a
defect. Checked in full at finding 95 and re-checked here.

**It does not claim the other batteries are safe.** Unchanged from findings 93, 94, and 95: whether
`inject-m1-ceiling.mjs`'s battery can report BLIND or misroute a target remains unmeasured.

---

## Finding 97: the batteries wrote to files they never verified

### The open question, finally answered

Findings 93, 94, 95 and 96 each closed with the same unmeasured sentence:

> whether other batteries can report BLIND or misroute a target remains unmeasured.

v1.38 pointed at it. The answer is **yes, and worse than "misroute"**: a battery
**silently overwrites a file it does not restore**, and reports a clean run afterwards.

### The defect

`scripts/injection/m1-ceiling-probe.py`, before this finding:

```python
original = probe_text if target == PROBE else golden_text   # line 247
...
target.write_text(mutated)                                  # line 261
```

Any target that is not `PROBE` reads the **golden fixture's text** as its source, and the mutated
result is written to `target`. Only `PROBE` and `GOLDEN` are used today, so the two cases that
exist are exactly the two the expression handles. **It was never wrong in a run, and it is wrong
for every target added later.**

### The measurement

An eleventh injection targeting `docs/audit.md` was added to prove it rather than argue it:

```
CAUGHT   Z. misroute probe: target a third file, whose text is not the fixture
battery: 11 caught, 0 survived, 0 inert
files written and restored: 2
sources restored: identical to backup
```

**Exit 0. Green. And `docs/audit.md` -- 8098 lines of audit -- had been replaced by the golden
fixture JSON and truncated to 183 lines.** Restored with `git checkout -- docs/audit.md` and
verified back at 8098.

### Why it still said "restored"

```python
restored = PROBE.read_text() == probe_text and GOLDEN.read_text() == golden_text
```

The check names **the files it knows about**, not **the files it wrote**. That is the same defect
finding 92 fixed in `type-miss-probe.py` by naming four inputs -- fixed locally, and never
generalised. Five batteries share the shape:

| Battery | Verified | Written | Status |
|---|---|---|---|
| `injection/m1-ceiling-probe.py` | `PROBE`, `GOLDEN` | via `target` | **confirmed exploitable** |
| `injection/scorer-stability-probe.py` | `DIST` | `DIST` | latent -- one target |
| `inject-stability.mjs` | `SRC` | `SRC` | latent -- one target |
| `inject-m1-ceiling-tests.mjs` | `TEST`, `PROBE`, `GOLDEN` | via `applied` | latent |
| `inject-component-rule.mjs` | per-entry `inj.file` | via `inj.file` | latent, closest to correct |

Only the first is proven to have destroyed anything. The rest are reported as sharing the
**shape**, and that word is used deliberately: a check that is right because the current target
list is short is not a check.

### A second defect, found while fixing the first

The first fix routed every write through a recorder and derived the restore from it:

```python
restored = all(path.read_text() == original for path, original in _WRITTEN.items())
```

**`all(...)` over an empty mapping is `True`.** Measured by disabling the recorder:

```
battery: 10 caught, 1 survived, 0 inert
files written and restored: 0
sources restored: identical to backup
```

A battery that recorded nothing reported a clean restore **having verified nothing**. A vacuous
pass is worse than the hard-coded pair it replaced: the pair at least verified two real files.

This was caught by injection K, whose requirement reads the recorded set rather than a computed
figure -- and **K SURVIVED** on the sabotaged recorder, which is how the hole was found at all.
The guard is now explicit:

```python
if not _WRITTEN:
    return False
```

Re-measured with the recorder still disabled: `sources restored: DIFFERS -- inspect before
committing`, **exit 1**. Healthy run: 11 caught, `files written and restored: 2`, exit 0.

**The lesson is not "a recorder is better than a list".** It is that **the fix introduced the same
class of defect it removed** -- a check that passes for a reason other than the property it
asserts -- and the only thing that caught it was an injection written to falsify the fix itself.

### The fix

The restored set is derived from the writes, in all five batteries. Two properties are asserted:

1. **A target's own text is read from that path.** `original = target.read_text()`. No path maps
   implicitly onto a fixture, so an entry whose mutation cannot match its own file fails loudly as
   INERT rather than being silently substituted.
2. **The restore covers what was written, and refuses the empty set.** A recorder keeps prior
   bytes at the first write; the check reads the recorded set back and requires it to be non-empty.

Each battery now prints `files written and restored: N` beside its verdict, so the *scope* of the
restore is visible in the output rather than implied.

A new test file, `packages/core/test/injection-target-routing.test.ts` (7 tests), holds all five
batteries to both rules and **enumerates the batteries from the directory**, so a battery added
later fails the suite until it is brought under them. The two exempt batteries
(`gate-tests-battery.py`, `type-miss-probe.py`) are named with the reason, because an omission has
to be a decision rather than a default.

### What was verified, and how

Every battery was re-run after the fix, and every one reports `0 survived / 0 inert` with a
non-empty derived restore:

| Battery | Result |
|---|---|
| `injection/m1-ceiling-probe.py` | 11 caught, 0 survived, 0 inert; 2 files written and restored |
| `injection/scorer-stability-probe.py` | 4 caught, 1 guarded upstream, 0 survived, 0 inert; 1 file |
| `inject-stability.mjs` | 4 caught, 0 survived, 0 inert; 1 file |
| `inject-m1-ceiling-tests.mjs` | passes; set derived from `ORIGINALS` |
| `inject-component-rule.mjs` | 8 caught, 0 survived, 0 inert; 2 files |

`git status` after all five run shows exactly the five battery files and the new test -- no
residue. The fix was validated by re-running the third-target probe: `docs/audit.md` survives at
8098 lines with its own header, and the battery reports `files written and restored: 3`.

### Verification

Repository suite: **2816 passed in 101 files**, 7 of them new. Package coverage:
**99.96 / 99.94 / 100 / 99.96**. Lint: `ALL PROPERTIES HOLD`. Core and CLI typecheck clean. All
injection scripts `py_compile` clean.

### What this does not claim

**It does not claim the other four batteries destroyed anything.** Only the m1 battery's selector
is proven exploitable. The rest share the shape and are now fixed as a class, which is a claim
about the code and not about their history.

**It does not claim the batteries are now audited.** This fixes the *restore*. Whether a battery's
requirement can be satisfied by a mutation it does not follow is finding 95's lesson N and remains
a per-injection property -- and this very finding added one such lesson by shipping, briefly, a
mutation that survived the fix.

**It does not claim a derived restore is sufficient.** It removes one way for a check to be blind.
A recorder can still be bypassed by a write that does not go through it, which is why the
`write_recorded` routing is itself asserted and why the direct `.write_text(` count is checked in
`injection-write-discipline.test.ts`.

**It does not claim the third-target injection is the only unmeasured one.** It is the one that was
run. The rule now makes the *next* target safe by construction, which is a different and weaker
statement than "all paths are tested".

## Finding 98: the misses were answered with a category the text does not carry

### The gap this closes

Finding 96 measured that the `category` misses follow a sentence naming a different
category as the thing that is *not* happening. It closed with an explicit gap:

> **It does not claim the dataset is fair to the model.** Whether writing a
> counter-evidence sentence into the incident text and then grading a category is a
> **well-posed task** is a labelling question, and it is not answered here.

That is a question about the dataset, not about the model, and this finding answers it from
the dataset side **without modifying the dataset**.

### The standard the dataset states for itself

`golden-master/fault-extraction/samples.json` carries its own authoring criteria in `provenance`:

> **note**: "Each incidentText is written to sound like a real support ticket or post-mortem
> while naming exactly one fault, so the expected record is **decidable from the text alone**."
>
> **authoringRule**: "The expected.type must be **derivable from the incident text** by a
> careful human reader. A sample whose answer needs context the text does not carry is a bad
> sample, not a hard one."

Those are the criteria this finding measures against, and a test asserts the quoted text is
what the dataset actually says, so the finding cannot drift from its own standard.

### The measurement, and the claim it falsified

The reading was written to support a claim I had already stated in the plan:

> "In five of five, the category the model answered is named in the text for the sole purpose
> of being ruled out."

**Measured, that is false.** The five misses finding 96's predictor reaches split **four to one**:

| Missed sample | Expected | Answered | The answered category in the text | Verdict |
|---|---|---|---|---|
| `middleware-database-connection-pool` | middleware | resource | **no term at all** | `absent` |
| `middleware-redis-latency-cache` | middleware | resource | **no term** -- the denial is about the *client pool* | `absent` |
| `middleware-mysql-replica-lag-analytics` | middleware | resource | **no term** -- the text says the primary `is healthy` | `absent` |
| `runtime-pod-kill-user-profile` | runtime | resource | `memory`, under `well under the limit` | `denied-only` |
| `middleware-kafka-consumer-lag` | middleware | code | **no term** -- the denial is about *broker throughput* | `absent` |

**In four of five the answered category has no term in the text whatsoever.** In the fifth the
only term sits inside a denial. **In none of the five does the text assert it.**

The corrected statement is stronger than the one it replaced: the model is not choosing among
hypotheses the text raises and inverting the one it rules out. It is producing a category the
text does not support at all. The 5-of-5 reading survives only as the superseded draft, because
the distance between it and the measurement *is* the finding.

Over the whole corpus the same reading is more emphatic still. Reading each of the eight
`category` misses against the category the model **answered**:

```
denial inventory (finding 98): 8 misses read against the category the model answered --
  7 absent, 1 denied-only, 8 unsupported in total
  absent          resource    -> answered code
  denied-only     runtime     -> answered resource   (via 'healthy', 'well under')
  absent          runtime     -> answered dependency
  absent          middleware  -> answered resource
  absent          middleware  -> answered code
  absent          middleware  -> answered resource
  absent          code        -> answered config
  absent          middleware  -> answered resource
```

**Eight of eight.** Every recorded `category` miss was answered with a category the incident
text does not carry as an assertion. The predictor that reaches 5 of 8 is a *weaker* instrument
than the one that reaches 8 of 8, and finding 96's block is retained beside this one precisely
because the two figures disagreeing is the evidence that they measure different things.

### The control, which is what keeps the reading from being trivial

If a denial were enough to produce `denied-only`, the reading would flag everything and mean
nothing. The dataset carries exactly one sample that both contains a denial and was answered
correctly -- `resource-cpu-saturation-checkout`:

> "…the pod sat pinned at its 500m limit. **The load generator was unchanged** from the previous
> week."

Its denial denies **the load generator** -- an instrument, not a taxonomy category. It reads
`also-asserted`, and the probe prints it first and separately:

```
control resource-cpu-saturation-checkout: expected resource, read also-asserted
  (markers: none) -- a denial of a non-category does not read as denied-only
```

A denial of a *category* invites that category as an answer. A denial of a *non-category* does not.

### The reading is clause-scoped, and that is load-bearing

The five reached misses discuss the denied category in one clause and the real cause in another.
A document-level test -- "does the category appear outside any denial, anywhere" -- would call
every one of them `also-asserted` and find nothing. So the reading splits on `[.!?;]` and then on
`, `, and attributes a verdict per clause: `denied-only` only when **every** clause carrying a
term carries it inside a denial.

The three-valued verdict is finding 94's rule applied to a fourth instrument: `absent` and
`denied-only` are different observations, and collapsing them would let "the text never mentions
resource" and "the text says resource is fine" produce one figure. **That collapse is exactly the
mutation that would have made the superseded 5-of-5 claim pass**, which is why the values are
separate rather than a boolean.

### What was built

| File | Change |
|---|---|
| `packages/core/src/fault/denial-inventory.ts` | new: three-valued reading of whether a category is present, denied, or absent, plus the corpus partition |
| `packages/core/test/fault/denial-inventory.test.ts` | new: 30 tests, including the correction as an assertion |
| `scripts/probe-type-misses.mjs` | new `denial` block, beside the existing `category` block |
| `scripts/probe-denial-inventory.mjs` | new standalone reading, and `probe:denial-inventory` |
| `scripts/injection/type-miss-probe.py` | 3 new injections (W/X/Y) and a fourth in-package target |
| `packages/core/src/index.ts` | registers `DENIAL_MARKERS`, `assessCategoryDenial`, `buildDenialInventory` |
| `packages/core/test/export-surface-enumerated.test.ts` | enumerates the new module |

`DENIAL_MARKERS` is a closed list of ten entries and is deliberately **not** finding 96's phrase
list. That list detects counter-evidence in the text; this one detects the grammatical shape of a
negation. Conflating them would break the control, which carries `unchanged` -- a finding-96
phrase -- while denying a non-category.

`CATEGORY_TERMS` is duplicated from `fault/collector.ts` on purpose, and the duplication is the
point: the module must be able to *disagree* with the classifier. Importing the table would make
"the vocabulary says this word belongs to this category" and "the reading found this word here"
the same act, which is finding 95's lesson. A test asserts the two tables agree on every shared
category, so a change to one without the other fails rather than drifts.

### The batteries

Three injections land in the new module, all caught, with `0 survived / 0 inert / 0 blind`:

| | Mutation | Figure it must move |
|---|---|---|
| **W** | force every term-carrying clause to count as a denial | `counts.alsoAsserted` (14) |
| **X** | return `denied-only` where the reading returns `absent` | `counts.absent` (4) |
| **Y** | restrict the corpus to its long samples | `graded` (19) |

Each requirement reads a baseline captured from the unmutated run rather than a literal, so a
dataset edit moves the requirement with the data. X is the mutation that would restore the
superseded 5-of-5 claim as code, which is why the values are separate rather than folded.

The probe block is separately checked by four subprocess tests in the module's own test file,
which **run `scripts/probe-type-misses.mjs` and cross-check its figures against the module**. The
wiring is a separate claim from the reading: a block can call the right function on the right
texts and still print them against the wrong rows, which is finding 92's defect. Two falsification
checks were run by hand -- reversing the column the block reads (2 of 30 tests fail) and
disconnecting the block from the payload (4 of 30 fail) -- so the tests discriminate rather than
agree.

Y's first draft filtered on a `missed` field that `InventorySample` does not carry, and the build
failed with TS2339: caught, but caught at compile with the requirement never evaluated. That is
the fourth occurrence of this trap in this battery and it is recorded here as a pattern: **a
mutation that cannot compile is a mutation that measured nothing.**

### Verification

Repository suite: **2849 passed in 102 files**, 5 of them new. `src/fault` coverage:
**100 / 100 / 100 / 100**; the new module alone is 77/77 lines, 77/77 statements, 3/3 functions,
32/32 branches. Lint: `ALL PROPERTIES HOLD`. Core and CLI typecheck clean. Injection battery:
**27 caught, 0 survived, 0 inert, 0 blind**, restore identical to backup across probe, fixture and
all four in-package targets.

### What this does not claim

**It does not claim the dataset is wrong.** It reports a criterion. Whether the criterion should
change is a separate decision with its own regression surface, and it is deliberately not taken
here. No sample text was edited.

**It does not claim the model would be right otherwise.** The answers are wrong. The finding is
that in eight of eight cases the text does not carry the answered category as an assertion, so
"the model chose a category the text supports" is not available as an explanation.

**It does not claim the three unreached misses behave the same way.** The reading covers the
`category` field. The three misses finding 96's phrase predictor does not reach were measured
separately as sharing no phrase pattern, and they are not claimed here.

**It does not claim causation.** With n=19 this is a structural observation recorded with both
denominators. That the authoring and the failures coincide is measured; that one caused the other
is not.

**It was wrong once, and the correction is the finding.** The claim was "named only to deny it,
five of five". The measurement is four absent and one denied-only. A finding that records only its
conclusion and not the claim it replaced is a finding that cannot be re-checked when the question
changes, which is the reason the superseded reading is quoted above in full.
