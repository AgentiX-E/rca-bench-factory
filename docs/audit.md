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
| a measurement exists | **established** -- the scorer's contract forces it, since 1 and 3 would have gone red |
| the threshold is met | **not established** -- this is `0` vs `2`, and both are consistent with a green job |
| the value of the rate | **not established** -- the artefact carrying it is unreachable |

> "The run succeeded" is not a reading, and it is not a failure either. It is the
> statement that the instrument worked, which is a different claim from the one the
> instrument exists to make.

### What would close it

The artefact is retrievable from a machine with ordinary internet access, or from the
GitHub UI. A second route exists and is worth taking regardless: **write the figures
into a place the API serves**, because the run's own summary is not exposed by REST
and the artefact host is unreachable from an allow-listed sandbox. Until one of those
happens, "M1 met or not" stays open, and `09` must not tick it.

### What this does not cover

- **Nothing about the model's quality.** Whether the rate is 40% or 80% is unknown
  here; only that it was computed.
- **`deepseek-chat` is still an alias.** `RCA_BENCH_LLM_MODEL` is now set to it
  explicitly, so the artefact records a configured value rather than an implicit
  default -- but the alias floats, so the reading is *auditable* and not *pinned*.
