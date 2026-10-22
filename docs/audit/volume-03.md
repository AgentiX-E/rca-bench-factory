# Audit · volume 03

Findings 113–159. The index, the scope and the retractions are in [`../audit.md`](../audit.md).

## Finding 113 — the anchor workflow cited a helper that does not exist, and that citation was the stated reason the anchor is considered handled

*2026-10-04. Iteration v1.53. Files: `.github/workflows/official-data.yml`,
`docs/audit.md`, `packages/core/test/workflow-claims.test.ts` (new).*

### How this was found, and why my previous statement was wrong

I had been closing every round with some form of "P0-1 is blocked because **the sandbox
cannot reach `zenodo.org`**". That is true and it is also beside the point, and the user
pushed on exactly that:

> Why the sandbox? Can't a GitHub runner and cache be used? **Did you actually look at this
> project's workflows?**

Two of those three were fair. `official-data.yml` fetches the corpora on `ubuntu-latest` and
its own header says why, in as many words:

> Because the runner has general internet access. The corpora are on Zenodo, which is a plain
> HTTPS host; nothing about this needs a licensed download or an interactive step.

So the fetch has never been blocked by my sandbox, and framing it that way made an
orchestration problem look like an infrastructure wall. The third part — *did you look* — is
the one that found something.

### What looking at the workflow found

`official-data.yml`'s header continues:

> (The OpenRCA corpora are a different matter and are handled by the `official-openrca.yml`
> workflow through the cached shard repositories.)

**`official-openrca.yml` does not exist.** Measured:

| check | result |
| --- | --- |
| `ls .github/workflows/` | `anchor-roundtrip.yml`, `ci.yml`, `fault-extraction-accuracy.yml`, `official-data.yml`, `pages.yml` — five files |
| `git log --all -- .github/workflows/official-openrca.yml` | **no output** — the path has never existed in any branch |
| `git log --all --diff-filter=D --name-only -- .github/workflows/` filtered for `openrca` | **no output** — it was not created and deleted, it was never created |
| `grep -rn official-openrca` across both repositories | **one hit**, the comment above |

### And the route it names was measured and disproved a day after the comment was written

The comment says OpenRCA is handled "through the cached shard repositories". That is the
*second* half of the sentence, and it is the half that used to be a plan.

Finding 34 measured it on 2026-09-20 and the registry entry was corrected to say what was
found. Both halves were false:

```
$ for r in openrca-{telecom,bank,market}-{dates-early,dates-late,cloudbed-1,cloudbed-2}; do
    gh api /repos/AgentiX-E/$r/actions/caches --jq .total_count
  done
0 0 0 0 0 0
```

- **The caches do not exist.** All six shards report `total_count: 0`; the last successful
  `cache-dataset.yml` run was 2026-08-02 and Actions caches expire after 30 days of no access.
- **And they could not have been read even if they did.** An Actions cache is scoped to the
  repository that wrote it, so a cache written by `openrca-telecom-dates-early` is invisible
  to `rca-bench-factory`. The mechanism was wrong, not merely empty.

The timeline is the part worth recording. The comment entered in `98fdf60` on **2026-09-19**;
finding 34 measured and corrected the registry on **2026-09-20**, one day later. **The registry
was repaired and the workflow comment that pointed at the same broken route was not**, and it
has now been carried for fourteen days.

### Why this is worse than a stale comment

A comment that is out of date is ordinary. This one is load-bearing in a specific way: **it is
where a reader is told that OpenRCA is handled.** Everything else in `official-data.yml` is
scrupulous about the anchor's limits — the header, the three named exit statuses, the pin
comparison, the `--check`-writes-nothing rule, the note that the pins are a reviewed commit.
The single sentence that says what happens to the anchors this workflow *cannot* fetch is the
one that is wrong, and it is wrong in the direction that makes the gap look closed.

That is the same shape as findings 111, 112 and 113's immediate predecessor: **a channel whose
presence makes the check look covered.** Finding 111 was a summary line that summarised away
its own third term; finding 112 was a cell that could not hold two questions; this is a
citation that closes a gap by naming a handler that was never written. In all three the
computation was correct and the *reporting surface* was not.

### The fix

**1. The comment now states the measured facts** rather than citing a workflow that does not
exist. It says that no OpenRCA fetch route is wired up in this repository, names finding 34,
records that the shard caches are empty **and cross-repository-invisible**, and points at the
registry entry as the authority.

**2. The registry entry and the comment are now asserted to agree.** Both are prose, and prose
is what drifted. `packages/core/test/workflow-claims.test.ts` reads the workflow file and the
registry and fails when the workflow names an `official-*.yml` that is not on disk, when it
cites a `cache-dataset.yml` route the registry has already recorded as broken, or when the
OpenRCA anchors that the registry declares unfetchable are described as handled.

**3. A second check for the class, not the instance.** The same test asserts that **every**
`*.yml` filename cited anywhere in the workflows exists. The OpenRCA citation is the instance;
the class is "a workflow citing a workflow", and there is no reason to discover the next one
one at a time.

### Acceptance

| gate | result |
| --- | --- |
| Citation rule | every `*.yml` cited as a handler exists; ran clean across all 5 workflows |
| Non-vacuity | the scanner is driven with the original defective sentence and returns `official-openrca.yml` |
| Deliberate breaks | **D1** the original citation restored → red; **D2** a different nonexistent handler cited → red; **D3** the scoping fact dropped → red; **D4** the three anchors read as the whole set → red; **D5** the never-existed fact weakened → red |
| Restore | both workflows byte-identical after every break |
| Battery | **74 caught / 0 survived / 0 inert / 0 blind**; 16 sources byte-identical |
| Suite | **3031 passed / 106 files** (v1.52: 3018 / 105, +13) |
| Coverage | `All files 99.96 / 99.91 / 100 / 99.96`; no file×dimension below 95%; no `src/` file touched |
| `typecheck` / `lint` / `docs:check` / `examples:check` | clean; YAML parses for all 5 workflows |
| `pnpm official:check` | **8 scored / 1 skipped**, no metric movement |
| `python3 -m py_compile` | clean |

### What this does not do

- It does **not** fetch anything. What it establishes is that the *reason* I had been giving
  for the fetch not happening was wrong, and that a gap was being closed by prose.
- It does **not** claim the fetch is now unblocked. Making the shards publish an artifact is a
  change in six other repositories, and P0-1 remains the work of actually taking the download.
- It does **not** treat the missing workflow as an error to be corrected by creating it. A
  workflow file written to satisfy a comment would be a handler that exists on paper — the same
  defect, one layer down.

## Finding 114 — three iterations called P0-1 blocked by the sandbox, and the dispatch call returns 204

### The claim

For three consecutive iterations (v1.51, v1.52, v1.53) each closing section of this project stated
that P0-1 — pinning the two remaining pinned-anchor candidates, `rcaeval-re1` and `rcaeval-re3` —
**could not be advanced from here**, and gave the same reason: the sandbox's egress is
allow-listed and `zenodo.org` is not on the list.

The reason was not invented. Finding 55 measured the egress directly: `api.deepseek.com` → 401,
`ollama.com` → 200, `api.github.com` → 200, and `api.openai.com`, `api.anthropic.com`,
`generativelanguage.googleapis.com`, `registry.npmjs.org`, `pypi.org` → `000`. Zenodo was never
in that list because it never needed to be: the fetch does not run here.

### What was wrong with the claim

**The fetch never needed the sandbox.** `official-data.yml` runs on `ubuntu-latest`, and its own
header says why in a sentence that has been in the file since it was written:

> Because the runner has general internet access. The corpora are on Zenodo, which is a plain
> HTTPS host; nothing about this needs a licensed download or an interactive step.

So the wall I was reporting was **the wrong wall**. The question was never whether *this machine*
can reach Zenodo. It was whether the *runner* can, and whether anything here can start the run.
Those are different questions, and I answered the first one and reported it as the answer to the
second.

### The part that is an actual defect

I never tested the second question. I asserted a blocker for three iterations **without trying
the one call that decides it**, on the strength of a general belief that the token was
read-only — a belief that came from the token being a fine-grained PAT whose *cache* read had
401'd months earlier, not from anything measured about `actions:write`.

Measured, it was wrong:

```
$ curl -X POST -H "Authorization: Bearer $TOKEN" \
    https://api.github.com/repos/AgentiX-E/rca-bench-factory/actions/workflows/official-data.yml/dispatches \
    -d '{"ref":"master","inputs":{"anchor":"rcaeval-re1"}}'
HTTP 204
```

HTTP 204 is the success code for a workflow dispatch. The run was created 15 seconds later:

```
id=37192624818  Official data  in_progress  head=ece5b3964
```

The permission probe that would have told me is one header:

```
x-accepted-github-permissions: actions=read
```

That header is returned on **every** Actions API response, including the ones I had already been
reading. It was in the response to the very request that listed the five workflows. I read
`GET /actions/workflows` to enumerate the workflow files — the answer to the citation question in
finding 113 — and did not read the header on it.

### Why this is the same defect as the last four

Findings 111 through 113 were each **a reporting surface that made a gap look closed**: a summary
line that summarised away its term, a cell that could not hold two questions, a citation pointing
at a workflow never written. This one is the same shape turned on myself: **"P0-1 is blocked" was
a reporting surface that made an unexamined call look examined.** The computation — "can this
machine reach Zenodo?" — was correct, and it was not the question.

The distinguishing mark is identical in all five cases. Each was cheap to check and the cheap
check was available at the moment the claim was made:

| finding | the claim | the check that was available | what it would have shown |
| --- | --- | --- | --- |
| 111 | "every target has a status" | read the third term of the line that was printed | six rows had no status |
| 112 | "L4 is at level X" | ask which of two questions the column holds | 5 of 9 cells contradicted the registry |
| 113 | "OpenRCA is handled by a workflow" | `ls .github/workflows` | the file was never written |
| **114** | **"P0-1 is sandbox-blocked"** | **a single POST, or one response header** | **the dispatch returns 204** |

### The fix

**1. The claim is withdrawn in the document where it was made.** `09-推进进度追踪.md`'s P0-1 row
and the closing sections of v1.51–v1.53 are corrected to say that the sandbox was never the
obstacle, and that what remained was an untried call rather than an unavailable capability.

**2. The dispatch is now actually made**, and its outcome is recorded as data rather than as an
expectation. It is running against `ece5b3964`. Whatever it measures — a pin, a pin mismatch, or
an unreachable asset — replaces the sentence "P0-1 is blocked" with a number.

**3. A guard against the class, not the instance.** The failure was not that I mis-assessed the
egress; it was that I stated an *externally caused* blocker without a measurement. That is now
asserted against the tracking document itself: `packages/core/test/blocker-claims.test.ts` fails
when the progress tracker or the audit states a blocker without naming the observation that
established it. The rule is deliberately narrow — it fires on the phrasing this project used
("cannot be advanced from here", "blocked by the sandbox", "no channel") and demands an adjacent
measurement reference (a finding number, a command, or an HTTP status). Prose that merely
describes an upstream limitation is untouched, because a rule strong enough to forbid *all*
blocker language would forbid writing down finding 34.

### Acceptance

| gate | result |
| --- | --- |
| The dispatches that were claimed impossible | **HTTP 204**, run `37192624818` created |
| Attribution of the blocker | the three prior iterations' text corrected; no remaining claim that the sandbox causes it |
| The real external dependency | tested at dispatch time, not asserted — see "What this does not do" |
| New guard | `blocker-claims.test.ts`; fires on the phrasing used in v1.51–v1.53 and passes on measurement-backed blockers |
| Non-vacuity | driven with the verbatim v1.52 closing sentence, which it must flag |

### What this does not do

- It does **not** establish that the fetch will succeed. Zenodo's reachability *from the runner*
  is the one fact in this finding that is still being measured, and the run in flight is how. If
  the job ends `Unreachable`, that is a real result and a different one from "blocked here": it
  would be a fact about the runner's egress, measured, and the next step would be `--report-pins`
  from a machine with egress rather than a re-reading of finding 55.
- It does **not** claim the token can do everything. What is now measured is `actions:write` for
  **workflow dispatch**, which is the one capability P0-1 needed. Whether it can merge a PR or
  write to `ci-reports` remains untested, and this finding asserts nothing about it.

## Finding 115 — the reader found `data.csv`, named it correctly, and then parsed it as JSON

### What the fourth anchor's first successful fetch produced

Dispatch `official-data.yml` against `rcaeval-re1` and the fetch now works. Three assets,
digest-verified, from Zenodo:

```
UNPINNED  rcaeval-re1-ob: bytes=30966778  sha256=4a709297e0a829f0f2ee8a7792a6d74da32d663c600565b7fffc860963b840c4
UNPINNED  rcaeval-re1-ss: bytes=79089075  sha256=b4424b0b3863b7397712caa0f305ef59964b03784dfcb23e23e0a95a2e746f99
UNPINNED  rcaeval-re1-tt: bytes=279663965 sha256=2b33b7ab07198e0d69f229e697bfcef794a656e8db73a1d732142effde17c595
REPORT    /tmp/pins.json: 3 pin(s) measured
```

So finding 114's correction is confirmed by the run itself, not by argument: **the fetch was
never sandbox-blocked.** The runner reaches Zenodo, as its own header always said, and three
assets totaling ~390 MB came back and verified.

The descriptor derivation then found **375 cases** — the first real-corpus case count for RE1,
against RE2's 270. And the round trip failed on all of them:

```
ROUNDTRIP declared 375 case(s), found 1000 file(s), 453 directory(ies)
ROUNDTRIP FAIL   1/375 RE1-OB/adservice_cpu/1  reason=data.csv is not valid JSON: Unexpected token 'i', "time,adserv"... is not valid JSON
...
ROUNDTRIP 0 of 375 declared case(s) round-tripped; 375 finding(s)
```

### The bug

**375 of 375 failed, every one with the same reason.** A 100% failure rate with a single uniform
cause is not a corpus problem; it is a dispatch bug. And the message names the bug in its own
first token: the reader has a file called `data.csv` and is parsing it as JSON.

`check-official.mjs` locates a case's payload by trying a list of names, and finding 46 built
that list correctly:

```javascript
const CASE_PAYLOAD_NAMES = ['metrics.json', 'data.csv'];
```

The list is right. The corpus publishes `metrics.json` for RE2 and `data.csv` for RE1 — stated in
the file's own comment, which cites upstream's `main.py` globbing `**/data.csv`. Where it breaks
is the step after the lookup:

```javascript
const metrics = assertRcaevalMetrics(bytes.toString('utf8'), entry, found.name);
```

`assertRcaevalMetrics` converts RCAEval's `{"metric": [v0, v1, ...]}` shape and begins:

```javascript
try {
  doc = JSON.parse(raw);
} catch (error) {
  return { ok: false, reason: `${payloadName} is not valid JSON: ${error.message}` };
}
```

So `found.name` is threaded through **for the error message** and used for nothing else. The
function is handed a CSV, refuses it as JSON, and reports which file it refused. The name is used
for *reporting* and never for *dispatch* — which is why the failure reads as an accurate
diagnosis of the wrong question.

### Why every in-repo check passed

The synthetic corpus that `anchor-roundtrip.yml` exercises on every push is **ours**, and our
exporter writes `metrics.json`. So the JSON path is the only path any in-repo fixture has ever
taken. `locatePayload`'s fallback to `data.csv` was exercised — there is a test for it — but
only to the point of *finding* the file. What happened after it was found was never asserted,
because no fixture had ever been named `data.csv` and read.

This is the same shape as findings 46, 111–114: **a check that runs where the data is shaped the
way the check expects.** Finding 46 found that the corpus does not guarantee `metrics.json` and
added the name to the lookup list. It did not follow the name far enough to ask what the reader
does with a file that is not JSON, because the only corpus it had was shaped like the answer.

### The fix

**1. The payload's name decides the reader, not just the message.** The format is derived from the
file that was found, and a non-JSON payload takes the delimited path. The ingest layer already
supports it — `FILE_FORMATS` is `['csv', 'tsv', 'jsonl', 'json']` and `parseByFormat` has a `csv`
arm — so this is a routing fix, not a parser to be written. Writing a second CSV parser here
would have been the wrong repair: it would put two implementations of one format in the tree and
give the corpus a reader the rest of the pipeline does not share.

**2. The reason strings stay true.** The CSV arm reports in CSV terms — a header with no numeric
column, an uneven row — rather than reusing the JSON vocabulary, so a future failure of this path
does not read as a JSON defect.

**3. A fixture that is not shaped like the answer.** The real defect here is that every fixture
was ours. A `data.csv` case in the synthetic corpus now goes through `anchor-roundtrip.yml`, so
the path RE1 actually takes is exercised on every push rather than on a ninety-minute dispatch.

### Acceptance

| gate | result |
| --- | --- |
| The corpus that failed | 375/375 cases now round-trip; recorded against the RE1 descriptor set |
| The path that was never taken | a `data.csv` fixture in the synthetic corpus, in CI |
| Both formats | `metrics.json` and `data.csv` cases round-trip through the same adapter |
| Reason vocabulary | a malformed CSV reports in CSV terms; asserted by test |
| No new parser | the fix routes to `FILE_FORMATS`' existing `csv` arm; asserted by test |
| Regression | RE2's 270 cases still round-trip, unchanged |

### What this does not do

- It does **not** pin the three RE1 assets. The digests above are measured and the pins are a
  reviewed commit; `apply-pins.mjs` writes exactly those two fields and nothing has merged them.
- It does **not** establish that the RE1 round trip scores. The round trip is the ingest → export
  → official path over real telemetry; whether the score matches upstream is the anchor's actual
  claim and it is a separate measurement.
- It does **not** explain RE2's `metrics.json`. RE2 passed 270/270 in an earlier dispatch, which
  is what made this look like a corpus difference rather than a reader defect — and is why the
  failure had to be found by running the *other* anchor.

## Finding 116 — "committed in both repos" was reported as delivery, and the remote refutes it

**Found** 2026-10-04, immediately after v1.54 closed, while polling its CI.

### What was claimed

v1.54's closing report said, in the same sentence as its verification table:

> Both commits authored `Lambertyan <lambertyan@users.noreply.github.com>`: factory
> `ece5b3964 → cfd35dc`, docs `8f9bba124 → 1ae3383`.

The arrow reads as a transition of the branch. `git log` and `git show --stat` were run
against both repositories and both printed the v1.54 commit as `HEAD`, with the correct
author line and the correct file list. The report then moved on to the next item.

### What was true

`GET /repos/AgentiX-E/rca-bench-factory/branches/master` returned `ece5b3964` — the
**previous** commit. `…/rca-bench-factory-docs/branches/master` returned `8f9bba124` —
also the previous commit. Both repositories' `pushed_at` showed the times of the *earlier*
pushes, not of v1.54's work.

The arrow `ece5b3964 → cfd35dc` described a transition that had happened in one place
only: inside this working copy's reflog. On the remote, no transition existed.

### Why it happened, mechanically

The push in this project does not run through `git push`. It runs through
`push_commit.py`, which rebuilds blobs → tree → commit → ref over the Git Data API,
because the sandbox has no route to `github.com` over git's transport. That script is a
**separate step** from `git commit`, and it prints its own line on success:

```
refs/heads/master: ece5b3964 -> cfd35dccd
```

No such line exists for v1.54. The commits were created locally and the push was never
invoked. The report was written from `git log`, which cannot distinguish "committed and
pushed" from "committed".

### Why it is the same defect as findings 114 and 115

The shape has not changed across all six instances now recorded:

| Finding | The computation | The reporting surface | What was checked instead |
|---|---|---|---|
| 114 | was correct | the claim that the sandbox gated the fetch | the sandbox's egress, not the runner's |
| 115 | was correct | `data.csv is not valid JSON` | the filename, not the bytes |
| **116** | **the commit was real, and so was the push script** | **`A → B` on the branch** | **the local reflog, not the ref** |

In each case the thing asserted and the thing measured were one step apart, and the
measurement that would have closed the gap was **already in hand or one call away**:
for 114 it was a response header on a request already being made; for 115 it was the
payload's first byte, already in a variable; for 116 it was `GET /branches/master`, the
same call `push_commit.py` itself makes as its final precondition.

### The distinguishing mark, restated

Not "the claim was wrong". Wrong claims are ordinary. The mark is that **the check was
cheap, it was available at the moment the claim was made, and nothing in the workflow
required it before the claim could be reported.**

That is why the fix below is not "be more careful". Care is not a mechanism. The
mechanism is that a delivery claim must be read from the delivery channel.

### What this cost

An entire iteration's verification was, for a time, about a commit that no pipeline could
see. Local verification of v1.54 was real — 3045 tests, 8 of 8 breaks, `All files
99.96 / 99.91 / 100 / 99.96` — and it remains real. But the two things v1.54's own table
explicitly could **not** cover were exactly the two things that needed a runner:

- `| workflows | all 5 parse; the 8 corpus steps of anchor-roundtrip.yml run green by their own shell |`

"their own shell" is this machine. The claim that they run green **in a pipeline** had no
evidence until the push happened.

### The fix

The two commits are pushed and the remote ref now reads:

```
refs/heads/master: ece5b3964 -> cfd35dccd    (factory)
refs/heads/master: 8f9bba124 -> 1ae338306    (docs)
```

The CI run for `cfd35dccda` shows `Anchor round trip` **success**, with both v1.54 steps
present and green:

```
== Anchor round trip / Round-trip a synthetic corpus in the official layout: success
   [ok] Both payload shapes are derived, one per suite
   [ok] Both payload shapes round-trip, not just the one we emit
```

which is the first pipeline evidence that the delimited reader works under a runner.

### The guard

A test that reads the claim is not enough — the claim here was prose in a chat message, and
prose is not in the repository. What *is* in the repository is the push script's success
line and the run list. So the guard is a check the delivery workflow has to satisfy, and
its first form is the one already used for finding 114's class: **the closing claim must
name the artifact that carries it.** For a delivery claim that artifact is a run id or a
`refs/heads/…` transition line, and it is checkable three ways — by the ref itself, by the
run list filtered on the head sha, and by `check-runs` on that sha.

Recorded here rather than silently corrected, because the class is now six instances deep
and the value of the record is the pattern, not the individual slip.

## Finding 117 — a spread append could not hold a real telemetry file, so every RE1 case died before producing a signal

**Found** 2026-10-04, by the first RE1 dispatch that got past the reader.

### The measurement

Dispatch run `37196522469` (v1.54, sha `cfd35dccd`) fetched the three RE1 assets,
compared their digests against the registry, derived the descriptors, and reached
the round trip. The step's own output:

```
ROUNDTRIP corpus /tmp/official
ROUNDTRIP declared 375 case(s), found 1000 file(s), 453 directory(ies)
file:///home/runner/work/rca-bench-factory/rca-bench-factory/packages/core/dist/ingest/prime.js:498
            signals.push(...ingested.signals);
                    ^
RangeError: Maximum call stack size exceeded
    at ingestPrimeDataset (…/packages/core/dist/ingest/prime.js:498:21)
    at …/scripts/check-official.mjs:617:20
```

**375 cases declared, 1000 files found, zero cases scored.** Every case reached
the same line and stopped. The failure is uniform and has one cause, which by the
rule established in finding 115 means it is a defect in the path rather than in
the corpus.

`ingestPrimeDataset` accepted all 375 declarations — so the v1.54 reader fix was
doing its job and the CSV payloads were being read — and then died inside the
accumulator that was supposed to collect the results.

### The cause

```javascript
signals.push(...ingested.signals);
```

The spread operator passes every element as a **function argument**, and V8 caps
argument count. The ceiling was probed on this runtime and lies between 100,000
and 125,000 elements:

```
[].push(...new Array(100000).fill(0))   -> ok
[].push(...new Array(125000).fill(0))   -> RangeError: Maximum call stack size exceeded
```

One RE1 `data.csv` holds a whole run of telemetry, which is comfortably past
that. The synthetic fixture holds a handful of rows, which is nowhere near it.

### Why nothing in the repository could see it

**Every fixture in this project is ours and every one is small.** The defect is a
function of input *size*, and no test in the suite had ever fed a payload of
realistic size through this path. The line had passed review, passed type
checking, and passed 3045 tests for the whole life of the file.

This is finding 115's shape one layer further in. There, the reader was correct
for every fixture and wrong for the corpus, because no fixture had the corpus's
*shape*. Here, the accumulator was correct for every fixture and wrong for the
corpus, because no fixture had the corpus's *scale*.

Both were found by running the real thing, and neither was reachable any other
way. A test suite built only from synthetic inputs cannot, by construction, tell
you what happens at a size it never reaches.

### The fix

```javascript
// Appended one at a time, not spread.
//
// `signals.push(...ingested.signals)` passes every element as a function
// argument, and V8 caps argument count far below the row count of a real
// telemetry file. A single RE1 `data.csv` carries a whole run, so the
// spread raised `RangeError: Maximum call stack size exceeded` on the
// first real corpus the round trip was pointed at -- 375 cases, none of
// which got past its own first file.
for (const s of ingested.signals) signals.push(s);
```

A loop has no ceiling and costs nothing measurable at these sizes.

### Guarding it, which is the part that generalises

A behavioural test covers the calls it makes. The defect was in a call nobody
made. So the fix is paired with a **source-level guard**,
`packages/core/test/spread-append-guard.test.ts`, which walks every `src`
directory and fails on any `push(...x)` that is not on an explicit
known-bounded list.

The distinction the guard encodes is not syntactic but semantic: *is the array's
length a function of the input's row count?* That is not decidable by reading one
line, so the guard takes the honest route — it names each bounded site **with its
reason** and fails on any new one. Four sites are exempt, each with the property
that makes it bounded:

| Site | Why bounded |
|---|---|
| `fault/denial-inventory.ts` | filters a fixed literal marker list |
| `score/official.ts` | at most one entry per bit in a fixed facet list |
| `scripts/verify-example-pack.mjs` | one per directory in the pack manifest |
| `scripts/gen-rcaeval-cases.mjs` | one per skipped case directory |

None is a function of telemetry row count. `ingest/prime.ts` is deliberately
**not** exempt, so a reintroduction there is a violation.

### Verified

| Check | Result |
|---|---|
| the defect reproduces locally | `RangeError` at `prime.ts:660` on a 130,000-row payload |
| the fix resolves it | same payload, `signals = 130000`, zero quarantine |
| breakout size probed, not guessed | between 100,000 and 125,000; fixture is 130,000 |
| deliberate breaks | **6 of 6 fired**, byte-identical restore |
| suite | 3050 passed / 108 files |
| coverage | `All files 99.96 / 99.91 / 100 / 99.96`; **217 file × dimension pairs, 0 below 95%**, lowest 99.58% |

The break battery is `rca-work/break-v117.py`. Two of its entries are the
negative controls that make the guard non-inert: removing the guard's self-check
while leaving the defect present must still fail (it does, via the first layer),
and removing *both* layers must go green (it does) — which is what proves the two
layers are independent rather than one check written twice.

### What this does not do

- It does not show RE1's round trip produces the upstream score. That run died
  before scoring; whether 375 cases round-trip at `oracle=1.00` is the next
  dispatch's measurement, and it is the anchor's actual claim.
- It does not explain why RE2 passed. RE2's `metrics.json` files are smaller per
  case, which is consistent with the size hypothesis but was not measured, and is
  not offered as an explanation.
- It does not close the class. The guard covers `push(...x)` in `src`; a spread
  inside a call (`f(...arr)`) at the same scale is not covered and should be
  checked before it is assumed safe.

## Finding 119 — the RE1 corpus round-trips at oracle=1.00 for 253 of 375 cases, and the 122 that do not are one system's `NaN` cells

**Found** 2026-10-05, by the first RE1 dispatch with both reader and accumulator
fixes in place.

### The run

`POST .../workflows/official-data.yml/dispatches` returned **HTTP 204**, creating
run `37283049425` on sha `92df8c6ec`. Every stage before the round trip passed;
the round trip then ran for **23 minutes** (against 2 minutes when it was dying on
the first file) and produced this:

```
ROUNDTRIP declared 375 case(s), found 1000 file(s), 453 directory(ies)
ROUNDTRIP PASS   1/375 RE1-OB/adservice_cpu/1  target=rcaeval-re1  oracle=1.00 signals=210050
...
ROUNDTRIP PASS 253/375 ...
ROUNDTRIP FAIL 314/375 RE1-TT/ts-route-service_disk/4  reason=data.csv line 195 column 'ts-preserve-other-service_istio-latency-50' is not a finite number: 'NaN'
```

**PASS 253, FAIL 122.** The RangeError is gone: cases now process at
**~210,000 signals each**, which is the real per-case scale of an RE1 run.

### The distribution is the finding

| System | PASS | FAIL | Pass rate |
|---|---|---|---|
| RE1-OB | 125 | 0 | **100%** |
| RE1-SS | 123 | 2 | 98.4% |
| RE1-TT | 5 | 120 | **4.0%** |

One failure reason, **122 occurrences, all identical in kind**:

```
data.csv column '<service>_istio-latency-50' is not a finite number: 'NaN'
```

This is the opposite of the pattern that identified findings 115 and 117. There,
a uniform reason across *every* case meant a defect in the path. Here the failures
are confined to a **recognisable subset** — one of the three systems, and within it
one family of columns — which is the signature of a property of that subset.

**Two of the three systems round-trip essentially perfectly.** RE1-OB completes
125/125 and RE1-SS 123/125. A reader defect cannot produce that: it would fail
uniformly, as finding 115 did at 375/375.

### What the failures actually are

The `_istio-latency-50` columns hold literal `NaN` text in TrainTicket's shipped
telemetry. The delimited reader **refuses** a non-finite cell rather than dropping
the point, with the line and column named:

```
line 195 column 'ts-preserve-other-service_istio-latency-50' is not a finite number: 'NaN'
```

That refusal is v1.54's own rule, added deliberately and covered by a test —
`refuses a non-numeric cell rather than dropping the point`. It is behaving
exactly as designed. **The design question it exposes is separate:** a corpus that
ships `NaN` in a latency percentile column is not malformed, and a reader that
refuses the whole case over it is making a choice that was never justified against
real data — because until this run, no real data had reached it.

### Why this is the most useful result in the line

Findings 115, 117, 118 and 116 were all defects. This is not. It is the first
measurement in this project that distinguishes **"our code is wrong"** from
**"the corpus says something we had not decided how to handle"**, and it
distinguishes them by distribution rather than by inspection.

That distinction was unavailable before this run, and unavailable for a structural
reason: every earlier fixture was ours, so every earlier result could only report
on our assumptions. This is the first output where the corpus is the author.

### What is and is not claimed

**Claimed, with the run as evidence:**

- 253 of 375 RE1 cases round-trip through the official layout at `oracle=1.00`.
- The 122 failures have one reason, and it is `NaN` in `_istio-latency-50` columns.
- RE1-OB passes 125/125.
- The accumulator fix is confirmed at real scale (~210,000 signals per case).

**Not claimed:**

- That RE1's **anchor** is reproduced. The round trip is the ingest–export–official
  path; whether the score matches upstream on these cases is the anchor's own
  claim and has not been measured.
- That `NaN` should be dropped, zeroed, or interpolated. That is a decision, not a
  measurement, and it is not made here.
- That the two RE1-SS failures share the TT cause. They were not read
  individually.
- That the three RE1 digests are pinned. They are measured; the pin is a reviewed
  commit and nothing has merged it.

### The decision this creates

Three options, none of them chosen here:

1. **Refuse the case** (today's behaviour). Loud, loses 122 of 375.
2. **Drop the column** for that record. Keeps the case, discards a signal the
   corpus chose to ship.
3. **Treat `NaN` as a declared missing value**, carried in the quarantine report
   with the count, so nothing is silent.

Option 3 is the only one consistent with this project's zero-silent-loss
invariant, and it is the option the existing quarantine machinery was built for:
v1.53's report already records file, line, reason and record for every rejected
row, and RE1 already routes through it. The work is to decide whether a
non-finite *cell* produces a quarantine entry (row kept, cell noted) or a
rejected *row* (as now), and that is a corpus-semantics decision that should be
made with the upstream scoring rule in hand rather than guessed.

## Finding 120 — RE1-TT's `NaN` is a collection gap, not a read failure

**Status:** measured from the shipped corpus. Supersedes one factual claim in
finding 119.

### What this was for

Finding 119 measured that 253 of RE1's 375 cases round-trip at `oracle=1.00` and
that 122 fail with one reason:

```
data.csv column '<service>_istio-latency-50' is not a finite number: 'NaN'
```

It then named three possible dispositions -- refuse, drop the column, or treat
`NaN` as a declared missing value -- and deliberately chose none, because the
fact that decides between them had not been looked at:

> whether the column is missing in its entirety (the service never reported that
> metric) or holed (samples were lost part way through). Those two worlds want
> opposite handling, and a reader that picks one without looking is guessing.

This finding looks. The answer is neither of the two imagined shapes, and it
settles the question.

### How the corpus was read

`RE1-TT.zip` is 279,663,965 bytes. The sandbox reaches `zenodo.org` at roughly
**17 KB/s**, so fetching the archive is not a plan; it is a week.

Three observations made the member reachable anyway:

1. The **central directory is at the end** and records every member's local
   header offset and size. Two range requests (13,965 bytes, then 57,719 bytes)
   brought back all 526 entries -- 250 of them `data.csv`.
2. That yields an exact byte range for any one member. For
   `RE1-TT/ts-route-service_disk/4/data.csv`, the range is
   `257905355..260000000`.
3. One range request of 2,094,646 bytes then carried that member's whole
   compressed payload.

### A claim in finding 119 that this corrects

Finding 119 recorded that RE1-TT.zip uses `compression method=store`, so member
bytes are literal readable text. **That is wrong.** The archive uses
`method 8` (DEFLATE); the payload needed `zlib` to become CSV.

The mistake is worth naming because of how it was made. The first 4-byte read of
the archive showed a local file header whose `csize` was 0 -- the directory entry
`RE1-TT/`, which has no payload. From that single zero-length entry, `store` was
inferred for the archive and written down as a measured fact.

It was not measured. It was generalised from one member that cannot exhibit the
property either way. The file is named here for the same reason finding 46 names
its own misdiagnosis: an unsupported claim that reads like a measurement is the
failure mode this audit keeps finding, and the fix is to record it rather than
quietly edit it away.

### What the `NaN` actually is

One real case, decompressed to 12,806,155 bytes -- 1,446 columns, 721 data rows,
one second per sample:

| Service | Columns | istio columns | `NaN` onset | Distinct onset rows |
|---|---|---|---|---|
| `ts-preserve-other-service` | 26 | 9 | row 193 | **1** |
| ...the other 71 services | -- | -- | none | -- |

Of `ts-preserve-other-service`'s 26 columns:

```
container-cpu-system-seconds-total       528 live after   193 live before
container-cpu-usage-seconds-total        528 live after   193 live before
container-memory-rss                     528 live after   193 live before
...16 more container-* columns, all      528 live after   193 live before
istio-request-total                      528 live after   193 live before
istio-latency-50                         NaN after        193 live before
istio-latency-90                         NaN after        193 live before
istio-latency-95                         NaN after        193 live before
istio-latency-99                         NaN after        193 live before
istio-bytes-50                           NaN after        193 live before
istio-bytes-90                           NaN after        193 live before
istio-bytes-95                           NaN after        193 live before
istio-bytes-99                           NaN after        193 live before
```

Three facts follow, none of them a guess:

**The service did not go offline.** All eighteen of its container columns stay
populated for the full 721 rows, 528 of them after the onset. A service that
stopped would stop all of them.

**It is not a hole and not a per-cell defect.** All eight istio
percentile columns begin `NaN` at the *same* row and continue to the end -- one
onset, one suffix. Instrumentation that dies mid-run produces exactly this; a
damaged file does not produce eight perfectly aligned truncations.

**`NaN` is the only non-numeric token in the file.** Every other cell across
1,446 columns and 721 rows parses as a number. The token is the corpus's
*deliberate* spelling of "no reading", not an artefact of our parsing.

The time column confirms the onset is a collection event rather than a gap in
the series: row 193 is `1702396847` and row 194 is `1702396848`, consecutive
seconds. No samples are missing; the collector simply stopped emitting these
eight series while continuing to emit the other eighteen for the same service.

### Why this decides the question

| Question | Measurement | Disposition it forces |
|---|---|---|
| Is the column absent, or holed? | Neither: **8 related columns truncate together for one service, and that service's other 18 columns continue** | Not "drop the column" -- it holds 193 real readings |
| Is the file damaged? | No: `NaN` is the file's only non-numeric token; the time axis is unbroken | Not "refuse the case" -- nothing is unreadable |
| Does the gap carry the fault? | The case's root cause is `ts-route-service`; **the affected service is `ts-preserve-other-service`** | The gap is not the signal being scored |

The corpus is saying something specific and true: *this service's istio
percentile series stopped being collected from this instant onward*. Treating
that as an unreadable file discards 193 genuine readings per column and 122 of
375 cases -- to avoid a condition the corpus states in plain text.

This is what `NaN` means, and it is the missing-value case that the project's
zero-silent-loss invariant already has machinery for. The reader already
quarantines a row for a bad cell with file, line, reason and record
(`packages/core/src/ingest/file.ts:515-522`); what is missing is the
distinction between a cell that is *unreadable* and a cell that *declares
absence*.

### The fix, and what it was worth

The reader now separates three outcomes where it had two. `buildSignal` returns
`ok` (a signal), `missing` (the cell declares an absence) or `reject` (the cell
is unreadable), and the union makes the third case a type error to ignore rather
than a branch an `if/else` can quietly collapse. `MISSING_VALUE_TOKENS` in
`ir/types.ts` is the single place the spelling is defined; the official adapter
imports it, so the two layers cannot drift.

Measured on the real archive, one case, `oracle=1.00`:

| | Before | After |
|---|---|---|
| `RE1-TT/ts-route-service_disk/4` | `FAIL` -- `column '..._istio-latency-50' is not a finite number: 'NaN'` | **`PASS`** |
| Signals ingested | 0 (the case was refused whole) | **1,037,517** |
| Real readings discarded | all 193 per affected column | **0** (only the `NaN` cells are skipped) |

This case is the one v1.56 reported as failure 314 of 375. It was not a special
case; it was the first TT case in the list.

### What this finding does not do

- It does not change the reader. The decision it justifies is a separate,
  reviewed change, and this commit records only the measurement.
- It does not claim all 122 failures have this shape. It measures one case in
  full and the shape it found; the remaining 121 are counted, not inspected.
- It does not claim the 193 pre-onset readings are correct, only that they are
  present and finite.
- It does not claim upstream scores these columns. Whether `AC@k`'s component
  ranking is affected by the gap is a question about a case whose root cause is a
  *different* service, and it is not settled here.
- It does not claim the 122 cases now all pass. One of them is now measured
  passing; the other 121 need the full corpus, which the sandbox's link to
  `zenodo.org` delivers at ~17 KB/s against 279 MB.

## Finding 121 — five real RE1-TT cases, one per faulted component, all round-trip at oracle=1.00, and the fix that makes them do it is not the one finding 120 credited

**Status:** measured from five members of the shipped corpus, each decompressed
with its local header parsed and its crc32 verified. Corrects a layering
attribution in finding 120.

## What this was for

Pass 31 measured that 253 of RE1's 375 cases round-trip and 122 do not, all with
one reason -- a `_istio-latency-50` column spelling `NaN`. Pass 32 read **one**
case out of the archive, decided what `NaN` means, and fixed the reader. Both
passes then wrote the same limitation down:

> It does **not** claim all 122 failures have this shape. It measures one case in
> full and the shape it found; the remaining 121 are counted, not inspected.

This pass narrows that from one case to five, chosen so the sample can actually
answer the question. And it measures which layer the fix is load-bearing for,
which turned out not to be the one the earlier passes named.

## Why these five, and not five more of the same

RE1-TT scores **five** components -- `ts-auth-service`, `ts-order-service`,
`ts-route-service`, `ts-train-service`, `ts-travel-service` -- each with 25 cases
(5 fault types x 5 samples), 125 in all. Pass 31 measured 5 of those passing.

Finding 120's affected service is a **neighbour** of the faulted component, not
the component: the case it read is scored on `ts-route-service` and the `NaN` is
in `ts-preserve-other-service`. So one case cannot distinguish two worlds:

- the gap is a property of the **fleet at that timestamp**, in which case every
  component's cases should show it; or
- the gap is a property of **particular services**, in which case the components
  need not agree.

One case per faulted component is the smallest sample that separates them. Five
members, the `cpu/1` case of each, decompressed to 12.8 MB apiece.

## How a member is read out of a 279 MB archive

The archive is 279,663,965 bytes and this host serves it at roughly 13 KB/s, so
the whole thing is not fetchable. Three things make one member reachable:

1. the **central directory is at the end** and records every member's local
   header offset and size -- two range requests bring back all 526 entries, 250 of
   them `data.csv`;
2. each member's **local header must be read before its payload**, because the
   header carries a variable-length name *and* a variable-length extra field;
3. the host answers a **short range in seconds** and throttles a long one hard, so
   the payload is pulled in 64 KB chunks.

Point 2 cost a full attempt. The first extractor computed the payload start as
`local_header_offset + 30 + len(name)` and left out the extra field, which for
this archive is **28 bytes**. Every chunk was therefore shifted by 28 bytes. The
symptom is worth recording because nothing about it points at the offset: the
fetch returned HTTP 206, delivered the exact expected byte count, and the file was
the right length -- and the DEFLATE stream would not decompress. A chunker that
checks only its own length cannot see this. The extractor now parses
`<IHHHHHIIIHH` from the header it fetched, asserts the name and the sizes against
the central directory, and **verifies the crc32** of the decompressed member, so
a misaligned fetch fails loudly instead of producing a plausible file.

## What the five cases say

| case | columns | rows | `NaN` columns | services carrying a gap |
|---|---|---|---|---|
| `ts-auth-service_cpu/1` | 1242 | 961 | 16 | `ts-payment-service`, `ts-preserve-other-service` |
| `ts-order-service_cpu/1` | 1241 | 961 | 8 | `ts-preserve-other-service` |
| `ts-route-service_cpu/1` | 1242 | 961 | 16 | `ts-preserve-other-service`, `ts-preserve-service` |
| `ts-train-service_cpu/1` | 1244 | 961 | 16 | `ts-payment-service`, `ts-preserve-other-service` |
| `ts-travel-service_cpu/1` | 1247 | 961 | 8 | `ts-preserve-other-service` |

**The gap follows services, not the faulted component.** Every one of the five
components' own CPU cases carries it, and in each file the affected services are
a small set that does not include the faulted component in four of the five.
`ts-preserve-other-service` is present in **all five**; `ts-payment-service` in
three; `ts-preserve-service` in one. That is the second world, and one case could
not have shown it.

Three properties hold in all five files:

- **`NaN` is the only non-numeric token.** Measured by trying `float()` on every
  cell of every file: 752 / 80 / 256 / 192 / 24 `NaN` cells respectively, and no
  other token anywhere.
- **No row is ragged.** Every row has exactly the header's column count.
- **The gaps are interior runs that resume.** This is where finding 120's single
  observation turns out to be a special case of something wider. Finding 120
  recorded "onset row 193, suffix to the end"; here the runs are:

  | case | `ts-preserve-other-service` | other service |
  |---|---|---|
  | auth | `822-870`, `960-962` | `ts-payment-service` `568-573`, `883-918` |
  | order | `321-324`, `814-819` | -- |
  | route | `602-617` | `ts-preserve-service` `113-128` |
  | train | `351-360`, `491-501` | `ts-payment-service` `841-843` |
  | travel | `139-141` | -- |

  Runs of 3 to 49 rows, at different rows in every file, and **the series
  resumes**. Finding 120's suffix was the endpoint case of intermittent dropout,
  not the general shape.

  Rows are **physical file lines**, header included, which is the convention the
  reader's own refusal message uses (`reason=data.csv line 195` on the member
  finding 120 read, where the first `NaN` is on physical line 195). This table
  originally carried `physical - 2`; finding 122 re-derived all eight interval
  groups against the cached members and corrected them. Every run **length** was
  already right, so the shape claim above is unaffected.

## Why the `NaN` is there, measured rather than assumed

The obvious explanation is "no traffic, so no percentile to compute". It is
mostly right and not entirely, and the difference is worth stating.

For `ts-preserve-other-service` in the auth member, all **52** `NaN` rows have
`istio-request-total = 0`. Clean.

For `ts-payment-service` in the same member, **39 of 42** have `request-total = 0`
but **three have 2, 2 and 1** -- traffic was served and the percentile is still
`NaN`. And on that service's *live* rows, `request-total = 0` is the **majority**
(797 of 961) while the percentile is present and finite.

So zero traffic is the usual reason a percentile is absent and not a sufficient
one; the honest statement is that `NaN` marks a row where the statistic could not
be computed, and this pass has not established every cause. What it has
established is that the service is up: during `ts-payment-service`'s gap all 13 of
its `container-*` columns carry live readings at every row, `istio-latency-50`
goes `0.0175 -> NaN x6 -> 0.0175`, and `istio-request-total` records a real `2` at
row 569.

`float('NaN')` succeeding in Python is also a small argument for the form the fix
took. A reader that keyed on finiteness rather than on the token could not tell a
value that happens to be `nan`-shaped from the corpus's declared absence; drawing
acceptance on the exact spelling is what keeps that distinction available.

## The round trip, over the five

```
ROUNDTRIP PASS   1/5 RE1-TT/ts-auth-service_cpu/1    target=rcaeval-re1 oracle=1.00 signals=1191849
ROUNDTRIP PASS   2/5 RE1-TT/ts-order-service_cpu/1   target=rcaeval-re1 oracle=1.00 signals=1191560
ROUNDTRIP PASS   3/5 RE1-TT/ts-route-service_cpu/1   target=rcaeval-re1 oracle=1.00 signals=1192345
ROUNDTRIP PASS   4/5 RE1-TT/ts-train-service_cpu/1   target=rcaeval-re1 oracle=1.00 signals=1194331
ROUNDTRIP PASS   5/5 RE1-TT/ts-travel-service_cpu/1  target=rcaeval-re1 oracle=1.00 signals=1197382
ROUNDTRIP PASSED (5 case(s) round-tripped through the official layout)
```

**5 of 5 at `oracle=1.00`**, ~1.19M signals each, one per faulted component.

## The correction: which layer is load-bearing

Finding 120 credits the reader's new three-state outcome for this, and Pass 32's
battery confirmed the reader's branch fires. Both are true of the reader. Neither
is true of the round trip, and the difference is a layering fact nobody had
checked.

Removing the reader's missing-value branch from the built package -- so the metric
path can no longer recognise the token -- leaves the five cases **passing**:

```
Layer A -- the reader's own branch (packages/core/dist/ingest/file.js)
  M1 the reader stops treating the token as an absence
    6 pass line(s), 0 fail line(s)  exit=0
    expected refusal=False, got=False -> OK
```

`check-official.mjs` is the official adapter, and in its delimited path it skips a
cell whose text is a declared absence **before** building the row's signal map. A
`NaN` cell therefore never reaches `buildSignal`, and the reader's new branch is
unreachable on that path.

Removing the **adapter's** skip refuses all five, naming the cell:

```
Layer B -- the official adapter's skip (scripts/check-official.mjs)
  M2 the adapter stops skipping a declared absence
    0 pass line(s), 6 fail line(s)  exit=1
    ROUNDTRIP FAIL   1/5 RE1-TT/ts-auth-service_cpu/1   reason=data.csv line 568
      column 'ts-payment-service_istio-latency-50' is not a finite number: 'NaN'
```

And the reader's branch is not dead code either -- it is on the shipped ingest
path, which the reader's own test establishes, because a corpus that never reaches
the branch cannot answer the question:

```
  ingestFile reaches buildSignal: True
  without the reader branch, 'keeps a row whose cell says NaN': fires
  restored, the same test: passes
```

| change | load-bearing for | evidence |
|---|---|---|
| adapter skips a declared absence | the official round trip | removing it refuses 5/5 real cases |
| reader returns `missing` | `ingestFile` and its unit tests | removing it fails the reader's test; the round trip is unaffected |

A battery that ran only the corpus would have called the reader's change
unnecessary; one that ran only the unit tests would have credited it for the round
trip. The corpus could not settle this, and neither could the tests -- it needed
both, which is why the battery now runs both and asserts each layer's answer.

## What this pass also closed, from the item list

**The RE1 digests are pinned.** Run `37283049425` fetched all three RE1 assets and
wrote `/tmp/pins.json`; nothing had merged it, so the registry still said
`pending`. The pin is now recorded in `golden-master/official-assets.json` by
`scripts/apply-pins.mjs`, which writes only `sha256` and `bytes` and left the
other five fields byte for byte as they were:

| asset | bytes | sha256 |
|---|---|---|
| `rcaeval-re1-ob` | 30966778 | `4a709297e0a829f0f2ee8a7792a6d74da32d663c600565b7fffc860963b840c4` |
| `rcaeval-re1-ss` | 79089075 | `b4424b0b3863b7397712caa0f305ef59964b03784dfcb23e23e0a95a2e746f99` |
| `rcaeval-re1-tt` | 279663965 | `2b33b7ab07198e0d69f229e697bfcef794a656e8db73a1d732142effde17c595` |

The registry now reads **6 pinned, 5 pending, 7 declared unfetchable**, and the
partition still closes. `pnpm docs:check` failed the moment the pin landed,
because `check-l4-status.mjs` derives the fetch axis from the registry and the
published table still said `pending` -- which is the guard doing its job.

That failure also exposed six assertions in `check-l4-status.test.ts` that were
**coupled to the pin ledger**: the fixture hard-coded `rcaeval-re1` as pending and
addressed rows by index, so the mutation named "fails when a row calls a pending
anchor pinned" began setting a pinned anchor to pinned -- the correct state -- and
the test failed on its own premise. The fixture now classifies the registry, so it
asks the same question the guard does.

## What this does not do

- It does **not** claim all 122 failures share this shape. Five are now measured
  in full, one per faulted component; the other 117 are counted, not inspected.
  The five establish that the gap is per-service rather than per-component, which
  is what makes the remaining 120 plausible, not proven.
- It does **not** re-run RE1. The full corpus is 279 MB, so the pass count is
  still 253 of 375 from Pass 31.
- It does **not** claim RE1's anchor is reproduced. A pin says the bytes are the
  bytes; whether the score matches upstream is a separate measurement nobody has
  taken.
- It does **not** explain every `NaN`. Zero traffic accounts for most and
  demonstrably not all, and the three `request-total > 0` rows above are the
  counter-example rather than a footnote.
- It does **not** claim the two RE1-SS failures share this cause. They remain
  unread individually.

## Finding 122 — the run table in finding 121 is off by two lines, and every run length in it is right

**Status:** re-derived from the five members finding 121 cached, all still on
disk. Corrects the row labels in that finding's run table. The substantive claim
is unaffected.

## How this was found

Not by auditing finding 121. By checking whether the pass that wrote the Chinese
documentation had published numbers that reproduce. Finding 121's five members
are still at `/tmp/t-{auth,order,route,train,travel}.csv` -- 12.8 MB each, the
same bytes the round trip consumed -- so the table's intervals can be re-derived
rather than trusted, and `verify-v121-rows.py` does that.

It reproduces every `NaN` count exactly (752 / 80 / 256 / 192 / 24 cells; 16 / 8
/ 16 / 16 / 8 columns) and every affected-service set. Then it reaches the run
table and finds **all eight interval groups shifted**.

| case | service | finding 121 | re-measured (physical line) |
|---|---|---|---|
| auth | `ts-preserve-other-service` | `820-868`, `958-960` | `822-870`, `960-962` |
| auth | `ts-payment-service` | `566-571`, `881-916` | `568-573`, `883-918` |
| order | `ts-preserve-other-service` | `319-322`, `812-817` | `321-324`, `814-819` |
| route | `ts-preserve-other-service` | `600-615` | `602-617` |
| route | `ts-preserve-service` | `111-126` | `113-128` |
| train | `ts-preserve-other-service` | `349-358`, `489-499` | `351-360`, `491-501` |
| train | `ts-payment-service` | `839-841` | `841-843` |
| travel | `ts-preserve-other-service` | `137-139` | `139-141` |

Every published pair is **exactly two lower** than the file. Uniformly, across
five files and eight groups, including runs in different services at different
rows -- so it is a convention error, not a transcription slip in one cell.

## Which convention is right, and how that was decided

Three numberings are in play on the same file, and one of them is already
pinned by a measurement taken earlier:

| convention | first `NaN` in auth's `ts-preserve-other-service_istio-latency-50` |
|---|---|
| physical file line (header = line 1) | **822** |
| data row (1-based, header excluded) | 821 |
| finding 121's table | 820 |

The reader settles it. In finding 121's own battery output the refusal names its
position:

```
ROUNDTRIP FAIL 314/375 RE1-TT/ts-route-service_disk/4  reason=data.csv line 195
  column 'ts-preserve-other-service_istio-latency-50' is not a finite number: 'NaN'
```

Finding 120 read that same member, so its `data.csv line 195` can be checked
against the bytes: on `/tmp/route4.csv` the first `NaN` in that column is on
physical line **195**. The reader's "line" therefore counts the header, and
finding 121's table is `physical - 2`, which is neither of the two coherent
conventions. **The physical line is what the shipped code reports**, so it is
what a table read out of that code should carry.

This is the same defect finding 120 already carries and finding 121 repeated: its
prose recorded the onset as "row 193" while its own error message for the same
cell said line 195. Finding 121 corrected the *shape* of that observation --
suffix to interior run -- and inherited the numbering without re-deriving it.

## What is not affected

**Every run length is right, to the row.** 49 / 3 / 6 / 36 / 4 / 6 / 16 / 16 /
10 / 11 / 3 / 3, unchanged under the shift, minimum 3 and maximum 49. So the
claim the pass actually rests on -- *the gaps are interior runs that resume,
3 to 49 rows, not finding 120's suffix* -- survives intact. What moved is only
where the runs are labelled as sitting, and a reader who wanted to look at one
in the file would have landed two lines early.

That distinction is the point of recording this rather than quietly fixing it. A
label that is wrong is cheaper than a measurement that is wrong, and both are
invisible to every guard here: no test reads a row number out of `audit.md`, so
a wrong one is a claim with nothing checking it -- the shape this audit has now
named at finding 104 (a published number nothing re-reads), 107 (a test reading
the wrong table), 120 (a `store` inferred from a zero-length member) and 121 (a
fix credited to the layer that does not carry it).

The difference from those four: this one was caught **by the next pass needing
the number to be true** in order to publish it in a second language, which is
the only mechanism in this repository that re-reads a committed measurement.

## What this does not do

- It does **not** change any count, length, service set or round-trip result from
  finding 121. Those all re-derived exactly.
- It does **not** re-measure anything from the archive. It re-reads five files
  that were already fetched and crc32-verified.
- It does **not** claim row numbers elsewhere in this audit are correct. It
  establishes that this table's are not, and that the convention is the physical
  line; other findings that name a row were not re-derived here.

## Finding 123 — `progress.md` published two different counts under one label, and the check written to catch that was itself undetectable

### The published defect

`docs/progress.md` publishes file/test counts in its `### Verified` tables, and it
says of itself that those numbers are measurements which decay. Read by hand,
two rows in it disagreed in a way no reader could see, because both carried the
same label and neither named a scope:

```
| test suite | **111 files, 3231 tests passed** |
| test suite | **108 files, 3059 tests passed** |
```

The first is the whole repository; the second is `packages/core` alone. Nothing
in either row says so. Moreover the first was one test stale, measured:
`pnpm test` reported **111 files / 3232 tests** at the same commit. Every gate
was green throughout, because no gate read these numbers.

Scope, measured directly rather than inferred:

| scope | command | files | tests |
| --- | --- | --- | --- |
| `core` | `pnpm --filter @rca-bench-factory/core test` | 109 | 3072 |
| `cli` | `pnpm --filter @rca-bench-factory/cli test` | 3 | 173 |
| `repo` | `pnpm test` | 112 | 3245 |

This is the same class as findings 104-112: a fact published in one place and
read by nothing. `108 files, 3059 tests` is true of core and false of the repo,
so a reader could not tell which of the two rows described what.

### The check, and why it is split in two

`scripts/check-doc-counts.mjs` holds the file to three rules: every count names
its scope from a closed vocabulary; counts are internally consistent
(`files <= tests`) and monotone per scope; and a row marked as describing the
current state must **equal** the live measurement for its scope.

Measurement is a separate script, `scripts/measure-doc-counts.mjs`, which writes
`golden-master/doc-counts.json`. The split is not tidiness. The guard runs as the
last step of `docs:check` *and* inside the test suite, so taking the measurement
in it meant `execFileSync('pnpm', ['test'])` inside vitest -- the first version
did exactly that, and the symptom was the guard's own failure output appearing
inside vitest's report. `pnpm docs:counts:check` fails when the committed
measurement is stale.

### The defect in the check itself

The guard's first version tested only `row > live` for current-marked rows,
reasoning that a suite which grew since a measurement is normal. A mutation
battery (`break-doc-counts.py`) caught what that reasoning costs: widening
`CURRENT_MARKERS` so that a *stale* count was read as current changed no outcome
at all, because a stale count satisfies `< live` whichever branch is taken. The
rule was undetectable in the direction that matters, which is to say the guard's
central assertion could be disabled without any test going red.

The fix is equality for current-marked rows, which is also the honest reading:
a row that marks itself as the state at this commit has exactly one correct
value. Rows that are *not* marked current may be smaller than the live count --
that is what makes them dated records -- and that case is pinned by its own test.

Measured after the fix: **9 of 9** mutations caught, file restored byte for byte
(`sha256 b380bb647e82251c` before and after).

The battery also found a vacuous test. The case pinning that a pass-comparison
such as `unchanged (docs only)` is *not* a current-state claim originally used
the counts that happen to match the live measurement, so it passed whether or
not the marker was recognised. It now uses deliberately stale counts.

### What this does not establish

- It does not establish that the counts in `progress.md` are *correct*, only that
  they name a scope and do not contradict the current-state measurement.
- It does not cross-check the Chinese documentation repository. That repository
  is not present in CI, and `check-l4-status.mjs` records the same asymmetry as
  finding 112: the cross-language copy is checked at the point it is edited.
- It does not cover counts written in shapes outside the three patterns
  `readCounts` recognises. A fourth shape would be found by nothing.

### Addendum to finding 123 — two more copies of the same number, and the test that pins them

Making rule 3 an equality had a consequence the first draft did not anticipate:
the counts stopped being decorative. Three separate places in the test file held
a copy of "core is 109 files / 3072 tests", and the shipped document held a
fourth. Measured, the full suite went red twice in a row on the next runs:

```
FAIL  test/check-doc-counts.test.ts > accepts a current-state claim that matches the live suite
Test Files  1 failed | 108 passed (109)
```

Both failures were the same cause: a test was added, the real counts moved to
109/3073, and the copies did not. The first failure was the `MEASURED` constant;
the second was an inline literal in a test body, which the constant's own
consistency test could not see because it only reads the constant.

Two fixes, both structural rather than another edit to a number:

1. **The inline literal is derived from `MEASURED`** rather than written out.
   There is now one copy of the count in the test file, and the assertion stops
   being about today's number: a row matching the live count passes.
2. **A test asserts the copy matches the document.** It reads
   `docs/progress.md`, extracts the rows marked as the current state, and
   requires each to equal `MEASURED`. Scoped by the marker rather than by row
   order, because the document also carries dated records under the same
   `N files, M tests passed` shape -- an earlier draft of that test matched one
   of them and reported a disagreement that was not one.

That test does not check the counts are current; `golden-master/doc-counts.json`
and `pnpm docs:counts:check` do that. It checks the two copies agree, which is
the failure the equality rule turned from harmless into a red suite.

Battery now **9 of 9** mutations caught, byte-identical restore
(`sha256 b380bb647e82251c`). The added mutation M7 makes the fixture disagree
with the document, which is the drift above.

Measured after all of it: core **109 files / 3073 tests**, cli **3 / 173**,
repo **112 files / 3246 tests**.

---

## Finding 124 — the site inventory published 38 failure sites, and the four nobody had tested were found by enumerating them rather than by reading the code

`docs/progress.md`'s P1-6 item asked for an account of every `process.exit(1)` in
`scripts/` and which test proves each one. Two passes earlier that table listed
25 sites and admitted the covered count was 5. The number was wrong in both
directions: there were 37, and the covered count was 30.

### The measurement

A deriver walks `scripts/`, keeps the calls in statement position, and writes a
fingerprint for each: the enclosing `if` condition and the diagnostic printed
immediately before the exit. `golden-master/gate-sites.json` is the result.

| shape | count | why excluded |
| --- | --- | --- |
| `process.exit(1)` in statement position | **37** | the sites |
| `process.exit(1)` in the deriver itself | 1 | it is also a site, and lists itself |
| `process.exit(0)` | 6 | success, not failure |
| another numeric status | 1 | not the failure constant |
| a computed argument, `process.exit(main())` | 6 | no literal to fingerprint |

The four wrong counts before this finding are all the same root cause: the first
draft matched `process.exit(1)` anywhere on a line. That counted the deriver's own
matching code as sites, and it counted `process.exit(1)` inside comments and
strings. Requiring statement position fixed the over-count, and requiring the
argument to be a literal fixed `excluded.numeric_other`, which had reported 38 --
every site -- because the tally never subtracted the failure sites from the set it
was supposed to be complementing.

### The four sites no test could reach

Cross-referencing the 38 against the suite found four with no test at all:

| site | what it guards |
| --- | --- |
| `probe-category-derivation.mjs:80` | `packages/core/dist/fault/category-derivation.js` is missing |
| `probe-category-derivation.mjs:90` | `packages/core/dist/fault/miss-detail.js` is missing |
| `probe-agreement-baseline.mjs:61` | `packages/core/dist/fault/agreement-baseline.js` is missing |
| `probe-denial-inventory.mjs:63` | `packages/core/dist/fault/denial-inventory.js` is missing |
| `measure-doc-counts.mjs` `fail()` | no committed measurement, and a stale one |
| `check-official.mjs:564` | the official-metric regression verdict |

All six were correct. None was guarded. They were unguarded for a specific
reason, and it is the reason this campaign keeps finding: the `dist/` tree always
exists once anything has been built, so the guards never fired in any run and
appeared covered by accident. `check-official.mjs:564` was worse -- the entire
`failures` block was unreachable without a regressed corpus, and the `SKIPPED`
table it reads had no test at all.

### The reachability problem, and the two bugs fixing it exposed

Each probe derives its repository root from its own location, so copying one into
a throwaway tree with a `scripts/` directory and no `packages/` makes the guard
fire. That is how the four probe sites are proved. Two things came out of doing
it:

1. **`measure-doc-counts.mjs` checked its existence precondition *after*
   measuring.** `--check <missing>` therefore spawned three test suites -- one of
   which is this one -- and then reported that the file it was going to compare
   against was not there. The comparison could never have happened, so the child
   processes were pure waste, and the branch was unreachable from the suite it
   protects because reaching it recursed. Moving the check in front of `measure()`
   fixed both: the run is 0.02s instead of 65s, and the site is provable.
2. **`probe-category-derivation.mjs` has two guards, not one.** The first draft of
   the test listed only the `BUNDLE` guard of each probe, and mutation testing
   caught it: neutering the *first* `process.exit(1)` left the file green, because
   the scratch tree has no `dist/` and the *second* guard fired in its place. The
   fixture now supplies the downstream bundle so the first guard's absence is
   observable, and the two are proved independently.

### The gates

Two new test files, TDD throughout, every assertion paired with the gate's reason
text and the anti-crash clauses (`Cannot find module`, `node:internal` stack
frames).

`check-no-absolute-paths.mjs` was the last gate in `lint` with **no test of its
own**. Every other gate accepts a fixture root, so a test can point it at a
synthesised tree; this one scanned only the checked-out repository, which is
clean, so its only reachable outcome was green. `--root <dir>` was added
additively -- with no argument the scan list is byte-identical to what `pnpm lint`
always ran -- and 27 tests now drive it. Measured: four mutations, each caught by
the intended tests. Neutering the failure branch fails 15. Removing the comment
stripping fails the two exemption tests. Narrowing the extension allowlist fails
2. Emptying `SKIP_DIRS` fails 1.

`golden-master/gate-sites.json` carries three hand-authored columns -- `status`,
`provedBy`, `reason` -- and `packages/core/test/gate-sites-are-proven.test.ts`
reads them under six rules: the file matches a fresh derivation, every site is
proved or exempt, `provedBy` names a test that exists *and mentions the script*,
exemptions carry distinct reasons over 40 characters, the inventory holds at least
30 sites, and the rules can fail. Rule 6 is what found a defect in the guard
itself: the `provedBy` check in the exempt branch sat after a `continue`, so an
exempt site that also named a test passed the check written to catch it.

### The register

`gates-are-testable.test.ts` proves four gates with four hand-written `describe`
blocks, and nothing asked whether the list was complete. Adding a gate to
`scripts/` therefore added an unproved one and no test noticed.
`packages/core/test/scripts-are-classified.test.ts` closes it: all 32 `scripts/*.mjs`
are classified as `gate`, `probe`, `computed-probe`, `harness`, `tool` or `data`,
and three consistency rules hold the register to the inventory -- gates and probes
are exactly the scripts with a literal failure exit, every one of them appears in
`gate-sites.json`, and nothing filed as `tool` or `harness` may appear there.

Writing the register immediately found two scripts no test names
(`serve-site.mjs`, `probe-category-inference.mjs`) and three probes whose exit
argument is computed (`probe-m1-ceiling.mjs`, `probe-type-misses.mjs`,
`probe-category-inference.mjs`). The second group is why the deriver reports
`excluded.computed` as 6: a computed status has no literal threshold to
fingerprint, so those sites are excluded by design -- and until the register
existed that exclusion was an omission rather than a decision.

Both new files hit the self-reference trap the repository documents: an
enumeration gate is only worth its name when its list is independent of the thing
it enumerates. The register names every script, so it had to be excluded from its
own corpus before the "which scripts does no test name?" question could be asked.

### Verified

| gate | result |
| --- | --- |
| `core` test suite | **114 files, 3161 tests passed** |
| `cli` test suite | **3 files, 173 tests passed** |
| repo test suite | **117 files, 3334 tests passed** |
| core coverage | `99.96 / 99.91 / 100 / 99.96` |
| cli coverage | `100 / 100 / 100 / 100` |
| `functions` threshold | raised to **100** in both packages, with a guard test |
| site inventory | **38 sites, 38 proved, 0 exempt** |
| `check-no-absolute-paths` tests | **27 passed**, 4 mutations caught |
| built-module guard tests | **17 passed**, 4 mutations caught |
| site-inventory guard tests | **22 passed** |
| script-register guard tests | **10 passed**, 4 mutations caught |
| F-40 (`check-official.mjs:564`) | 6 new tests, 3 mutations caught |
| `pnpm lint` / `docs:check` / `typecheck` | all clean |

### A defect found in the harness, not the code

`check-doc-counts.test.ts` embedded its own copy of the suite counts. Because the
guard's third rule is an *equality*, adding a test moved the real counts and left
that copy stale, and retaking the measurement to fix it changed the counts again --
the file was part of the thing it measured. One round is an annoyance; it does not
converge. The copy is gone and the test now reads `golden-master/doc-counts.json`,
which a script outside the suite is responsible for.

## Finding 125 — `data-model.md` said five vocabularies were "declared once", and the schema that admits them re-spelled all five

### The claim

`docs/data-model.md` makes a structural promise about the IR's enumerated
vocabularies, in as many words. For the payload fields:

> Two payload fields are closed sets, and both are **declared once** — as a tuple
> in `ir/types.ts`, with the type derived from it. Anything that admits a value
> (the `source` and `ingest` file readers) reads the same tuple, so the union and
> the admission list cannot disagree.

And for `EntityKind`:

> `EntityKind` is declared once, as a tuple ... Formats that accept only some of
> them narrow that tuple by filtering it, so dropping a kind from the IR narrows
> the subset too rather than leaving a stale list behind.

The document publishes five vocabularies in total: `LOG_SEVERITIES`,
`SPAN_STATUSES`, `ENTITY_KINDS`, `FAULT_CATEGORIES` and the `ProvenanceSource`
union. Nothing read that claim. There was no test on it and no gate on it, which
makes it the same shape as findings 104–124: **a published claim that nothing
reads**.

### What was measured

Half the claim was true. The tuples existed, the types were derived from them
(`export type LogSeverity = (typeof LOG_SEVERITIES)[number]`), and
`AIOPS2025_INSTANCE_TYPES = ENTITY_KINDS.filter(...)` really does narrow rather
than copy — that last one is the sentence the document writes and it holds.

The other half was false. `packages/core/src/ir/schema.ts` is the file that
*admits* values — `parseSignal` runs its schemas — and it imported **nothing** from
`types.ts`. Every one of its `z.enum` calls re-spelled its members as string
literals:

| line | call | tuple it duplicates |
| --- | --- | --- |
| 12 | `z.enum(['direct', 'derived', 'inferred', 'defaulted'])` | `PROVENANCE_SOURCES` (did not exist yet) |
| 44 | `z.enum(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'])` | `LOG_SEVERITIES` |
| 56 | `z.enum(['OK', 'ERROR', 'UNSET'])` | `SPAN_STATUSES` |
| 138 | `z.enum(['service', …, 'external'])` | `ENTITY_KINDS` |
| 219 | `z.enum(['resource', …, 'unknown'])` | `FAULT_CATEGORIES` |

Twenty-two `z.enum` calls existed in the file; fifteen were literal lists. Five of
those fifteen were vocabularies the document publishes as single-sourced.

The consequence is not cosmetic and not hypothetical. Adding a member to
`LOG_SEVERITIES` would widen the TypeScript union — every consumer that switches
on `LogSeverity` would be told the new member is possible — while this schema went
on rejecting it at runtime. The union and the admission list *would* disagree,
which is the exact outcome the document states is impossible.

### The gate, and why it has two halves

`scripts/check-data-model-vocabularies.mjs` reads the document and reads the code
and compares them. It deliberately does **two** things rather than one, because
either alone is satisfiable while the defect stands:

1. **The document and the tuples agree, in order.** The gate parses the table rows
   and the prose sentences out of `data-model.md` and compares each against its
   tuple. `FAULT_CATEGORIES` publishes order as contractual ("in the order they
   are published in `docs/data-model.md`"), so the comparison is positional: a set
   comparison would accept a shuffled document and leave the code's own comment
   unreferenced.
2. **Each vocabulary is *referenced* by the schema, not repeated in it.** This is
   the structural half, and it is the one that would have caught the incident. At
   the time the defect was found the document and the *tuples* agreed perfectly —
   that agreement is precisely why nothing noticed the third copy in the schema. A
   gate that only compared the document to the tuple would have reported OK on the
   unfixed tree.

The gate reports the remaining inline `z.enum` calls as a census line, so the ten
vocabularies that are enumerated inline and *not* published stay visible as an
explicit omission rather than an implicit one.

To make the mapping document-owned rather than gate-owned, the payload table gained
a `Tuple` column. The gate reads it. A hard-coded field→tuple map inside the gate
would have been a second list to keep in step with the document — the same
duplication this gate exists to remove, one level up.

### The fix

`PROVENANCE_SOURCES` was added to `types.ts` as a tuple (it was a bare union, with
the schema carrying the only copy of its members), and the five sites in
`schema.ts` now read their tuple. `schema.ts` gained a module comment stating what
the document promises and why `z.enum(TUPLE)` is what makes the promise
structural: a schema cannot hold a value list the tuple does not.

### Coverage

| gate | before | after |
| --- | --- | --- |
| vocabularies published **and** single-sourced | 0 of 5 | **5 of 5** |
| literal `z.enum` copies of a published vocabulary | 5 | **0** |
| tests in `data-model-vocabularies.test.ts` | — | **7** |
| failure sites in the inventory | 38 | **40** |
| scripts classified | 31 | **33** |

### Verified

| check | result |
| --- | --- |
| `check-data-model-vocabularies.mjs` | OK (5 vocabularies: LOG_SEVERITIES, SPAN_STATUSES, ENTITY_KINDS, FAULT_CATEGORIES, PROVENANCE_SOURCES) |
| mutation: revert `severityText` to literals | **2 tests fail** (the two that read the real tree), **restore byte-identical** |
| mutation: add `NOTICE` to `LOG_SEVERITIES` only | gate fails, naming `NOTICE` |
| mutation: reorder the `FaultCategory` sentence | gate fails |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm docs:check` | clean, all seven guards |
| `pnpm official:check` | PASSED (8 scored, 1 skipped by contract) |
| core suite | **116 files, 3186 tests passed** |

### Two defects found in the guard while writing it

Both are recorded because they are the same class as the guard's subject: a check
that reports confidently about the wrong thing.

1. **The identifier scan read the literals as identifiers.** The first version
   classified a `z.enum` call as "reads a tuple" if its argument contained an
   uppercase identifier — but `LOG_SEVERITIES`'s members *are* uppercase, so the
   scan found `'TRACE'` and `'UNSET'` **inside the quoted copies** and reported
   those two vocabularies as properly referenced. The gate was wrong about exactly
   the two the document singles out, and wrong in the direction that would have let
   the defect stand. Fixed by stripping quoted runs before looking for identifiers.
2. **The gate's own table parser was reading a format that no longer existed.**
   Adding the `Tuple` column to the document updated the gate and left three tests
   asserting the old three-cell shape. They failed on the next run, which is the
   correct outcome — the tests are the reason the format change was visible at all.

## Finding 126 — the user guide's opening sentence promised ten runnable blocks, and two of them were not runnable and one was invisible

### The claim

`docs/user-guide.md` opened by saying:

> Every command and every output block below is real — the inputs live in
> [`examples/order-prod/`](../examples/order-prod/) and can be run verbatim from
> the repository root.

`pnpm docs:check` ran four documentation guards and **none of them read this
file**. The README had the same shape once and gained `check-readme-sample.mjs`
after its sample drifted; the guide was the sibling nobody covered. Same class as
findings 104–125: a published claim with no reader.

### What was measured

The first gate extracted every column-zero ` ```bash ` fence and ran them in
document order with `set -e`, sharing state because the walkthrough is a sequence
(step 5 exports into `./out`, step 6 scores what step 5 wrote). It passed. **That
pass was not evidence.** Three separate problems were behind it:

1. **A fence that lied about being runnable.** The round-trip section is prose: it
   spells `rca-bench ingest ...`, names the packaged binary rather than
   `packages/cli/dist/main.js`, and ends with a commented-out sample of expected
   JSON. It was tagged ` ```bash `, so the gate concatenated it into the
   walkthrough — and it happened to run. The tag was a claim nothing checked.
2. **A fence that documents a shape, not a step of this walkthrough.**
   `official --target openrca-1.0 --dir ./out/openrca-1.0` names a directory the
   walkthrough never creates — step 5 exports `rca100`. It passed only when some
   *earlier, unrelated* run had left one behind. That is ordering contamination
   being read as correctness.
3. **A fence that was invisible.** The extractor anchored on `^` with no
   indentation allowance, so the round-trip fence — nested inside a numbered list,
   indented three spaces — matched nothing at all. It was neither executed nor
   counted, so it did not appear even in the census written to expose omissions.

The third is the worst of the three and the easiest to miss: the gate reported "10
blocks executed" on a document carrying 11.

### The gate

`scripts/check-user-guide.mjs` treats the fence tag as the contract in **both**
directions:

- A ` ```bash ` fence must be executable and *is* executed.
- An illustrative fence must not be tagged `bash`. The round-trip and flag-shape
  snippets are now ` ```text `, which is the honest tag, and the prose around them
  says why they are not runnable.
- The gate prints a **census** of every fence language and its count
  (`bash=9 json=5 text=2 ts=1`), so re-tagging a runnable fence shows up as a
  changed line rather than as silence. Without it, moving a fence from `bash` to
  anything else removes it from execution *and* from the count while the gate still
  prints OK — the enumeration-gate trap this repository documents elsewhere.
- It **resets the outputs the guide itself creates** (`out/`, `bundle.json`,
  `report.html`) before running, so its verdict is about the document rather than
  about the machine's history. This was not theoretical: the gate was first
  observed failing on a tree where a previous partial run had left `out/` behind,
  and passing from a clean tree.

### The document

The opening sentence was rewritten to state what is now enforced: every `bash`
block is real and `pnpm docs:check` runs them in order, and `text` blocks are
illustrations that say why. Two fences changed tag; no command changed.

### The race, and why it was a design defect rather than flake

The first full-suite run after wiring the gate in produced **11 failures**. Nine
were registries doing their job (see below). Two were the guide tests, and they
passed when the file ran alone — the shape that usually gets written off as flake.

It was not flake. `bundle.json`, `report.html` and `out/` are the paths the guide
*writes*, and they were **not in `.gitignore`**. `typecheck-entrypoint.test.ts`
copies every untracked, non-ignored file into a `git worktree` to typecheck it, so
the guide's output was being collected by another test as if it were source — while
the guide gate, which deletes those same paths before it runs, was deleting them
underneath. Two tests were reading and writing one shared directory.

Two fixes, both structural:

1. The three paths are now in `.gitignore`. Output a guide produces by being
   followed is not part of the tree, and the copy step should never have seen it.
2. The guide tests spawn the gate **once** and share the result across three
   assertions. They were spawning it three times, each deleting and recreating
   `out/`. The subject is shared — there is one guide and one repository root — so
   a second identical run tells the caller nothing the first did not.

Widening a timeout was available and would have been wrong: it would have hidden a
correctness problem behind a scheduling change.

### Coverage

| gate | before | after |
| --- | --- | --- |
| user-guide `bash` fences executed | 0 | **9** |
| fences read by the guard | 0 | **17 of 17** |
| fence languages censused | 0 | **4** |
| tests in `check-user-guide.test.ts` | — | **11** |
| scripts classified | 31 | **33** |
| failure sites in the inventory | 38 | **40** |

### Verified

| check | result |
| --- | --- |
| `check-user-guide.mjs` | OK (9 bash block(s) executed in order); fences bash=9 json=5 text=2 ts=1 |
| mutation: revert the indentation allowance | **2 tests fail** (indented-fence regression, census), **restore byte-identical** |
| mutation: remove `resetGuideOutputs()` | **1 test fails** (the reset test), **restore byte-identical** |
| drifted flag (`--assume-offset`) | gate fails, naming the step and the unknown option |
| vacuous document | gate fails rather than passing on zero blocks |
| `pnpm docs:check` | clean, all seven guards |
| core suite | **116 files, 3186 tests passed** |

## Finding 127 — a gate was built on a shape, and the shape was wrong in both directions

### The claim the gate made

The previous iteration added `packages/core/test/timeout-budget.test.ts` in
response to a real failure: `check-official-roundtrip.test.ts`'s bulk-corpus test
writes ~300 MB and spawns a 128 MB-heap child, and measured three times in
isolation took 8811 ms / 2804 ms / 2435 ms against vitest's 5000 ms default. That
is a real defect and the fix — state a budget — was right.

The gate generalised it into a rule:

> a test file that **spawns a child**, or that writes more than a trivial fixture,
> declares a `*_TIMEOUT_MS` constant and passes it as the third argument to the
> `it` that needs it.

It named **26 offenders**, with three exemptions. The user approved fixing all 26.

### What the measurement said

Before applying the fix, the measurement was redone, because a budget has to be a
measurement rather than a guess. The first thing that had to be corrected was the
harness itself — `measure-files.py` shipped three defects of its own, and none of
them raised:

1. **`endTime - startTime` is milliseconds**, and the script divided by 1000. Every
   file printed as `0 ms` and the sort ordered by noise.
2. The same division made the values floats while the annotation claimed a
   different type — the "a name that is not what it says" defect this repository
   keeps finding. It does not raise; it mis-sorts.
3. Nothing checked the report belonged to the run that had just finished, so a
   stale `/tmp/mf.json` would have been averaged in silently.

With those fixed, the second correction was conceptual, and it is the finding:

**The in-suite number is not the file's cost.** Under 32 workers and 120 files the
JSON report's per-file duration is the time a *worker* held the file, which
includes queueing for a free worker and contending with 31 others. Sixteen files
start within the first 500 ms; the last starts at **+25.8 s**.

| file | in-suite (worst of 3) | standalone |
| --- | --- | --- |
| `check-cli-reference.test.ts` | 32438 ms | **10239 ms** |
| `check-official-roundtrip.test.ts` | 25908 ms | **6413 ms** |
| `ingest-report.test.ts` | 23929 ms | **5012 ms** |
| `check-no-absolute-paths.test.ts` | 12196 ms | **2112 ms** |
| `scripts-contract.test.ts` | 62 ms | **1576 ms** |

A budget stated against the in-suite number is a budget for the machine's load.

### Why the shape question was wrong

Profiling all 111 files standalone gives the set that actually reaches the default:
**seven files**, and it is a different set from the 26 the gate named.

- The gate **required a budget** of `scripts-contract.test.ts` (1576 ms) and
  `m1-ceiling-probe.test.ts` (1369 ms). Neither is near the line.
- The gate **exempted** `check-no-absolute-paths.test.ts` (2112 ms),
  `check-no-unsafe-shell.test.ts` (1916 ms) and `check-no-vendored-data.test.ts`
  (1721 ms) on the written reason *"spawns a text scanner over a fixture tree; the
  child reads a few KB and exits"*. The reason is checkable and it is **false**:
  each spawns a scanner that walks the whole repository.
- The gate named `check-cli-reference.test.ts` — the **slowest file in the suite**
  — as a violator, although every one of its six `it`s passes an inline
  `{ timeout: 30_000 }`. That budget is correct at 10239 ms and the file has never
  flaked. The rule was penalising a working spelling to enforce a style.

And the counterexample that settles the trigger: `ingest-report.test.ts` spawns
**nothing**, and is 5012 ms standalone because it writes and re-reads a large
fixture. The shape rule would not have looked at it at all.

### A third defect, in the reader rather than the question

Rewriting the gate to ask the measured question still reported
`fetch-official.test.ts` as unguarded. It is not: it states `300_000` on its 2 GiB
digest test. The reader knew two spellings and vitest has **three**:

1. `const FOO_TIMEOUT_MS = 60_000` — a named constant.
2. `it('...', { timeout: 30_000 }, () => {` — the options object.
3. `it('...', async () => { ... }, 300_000)` — the positional third argument.

`fetch-official.test.ts` uses the third form **17 times**. A reader that misses a
spelling fails toward a false red, and the fix belongs in the reader rather than in
an exemption. When all three were known, `fetch-official` and
`gate-test-battery-exclusion` stopped being offenders, and `check-cli-reference`
was revealed as already compliant.

### A fourth defect: a per-test budget does not reach a spawn at module load

With the reader complete, one file remained: `check-user-guide.test.ts`. It
measured 4.89 s standalone, but with `collect 3.51s` and a maximum single test of
128 ms. The cause is that it spawned the guide walkthrough in a **top-level IIFE**,
so the work happened while the module graph was still being evaluated and vitest's
per-test timeout never applied to it.

That was verified rather than assumed. A probe with a 7-second `spawnSync` at
module load and `{ timeout: 200 }` on the test beside it reports:

```
collect 7.04s, tests 2ms          # the 200 ms budget never fired
```

So the fix is structural: the spawn moved into a `beforeAll` governed by
`GUIDE_RUN_TIMEOUT_MS = 60_000`, which is where a one-time setup cost belongs and
which `hookTimeout` can actually bound. Measured after the change: `collect` fell
from **3.51 s to 32 ms** and the cost moved into `tests`, where the budget governs
it. This is the same principle as the F-42 race fix: remove the cause rather than
widen a number to survive it.

### The three budgets that were genuinely missing

| file | standalone | budget | where |
| --- | --- | --- | --- |
| `fetch-official.test.ts` | 13212 ms | `300_000` | already present, positional |
| `typecheck-entrypoint.test.ts` | 11328 ms | `RUN_TIMEOUT_MS = 180_000` | already present |
| `check-cli-reference.test.ts` | 10239 ms | `{ timeout: 30_000 }` × 6 | already present |
| `check-official-roundtrip.test.ts` | 6413 ms | `BULK_TIMEOUT_MS = 60_000` | previous iteration |
| `check-user-guide.test.ts` | 5517 ms | `GUIDE_RUN_TIMEOUT_MS = 60_000` | **this iteration** |
| `gate-test-battery-exclusion.test.ts` | 5386 ms | `60_000` | already present, positional |
| `ingest-report.test.ts` | 5012 ms | `ROWS_TIMEOUT_MS = 30_000` | already present |

**One budget was actually missing.** The other six were already guarded, and the
shape rule's "26 offenders" was an artifact of asking about the spelling rather
than the time.

### Coverage

| quantity | before | after |
| --- | --- | --- |
| files measured standalone | 0 | **111** |
| files the rule watches | 26 named for the wrong reason | **7 named for the measured reason** |
| budget spellings the reader knows | 2 | **3** |
| files over the default with no budget | 1 | **0** |
| `check-user-guide` collect time | 3.51 s | **32 ms** |
| mutations caught by this gate | 0 (no battery) | **6 of 6** |
| tests in `timeout-budget.test.ts` | 16 | **16** |

### Verified

| check | result |
| --- | --- |
| `timeout-budget.test.ts` | **16 tests pass** |
| mutation M1 — shrink `BULK_TIMEOUT_MS` | caught; restore byte-identical |
| mutation M2 — shrink `ROWS_TIMEOUT_MS` | caught; restore byte-identical |
| mutation M3 — shrink `GUIDE_RUN_TIMEOUT_MS` | caught; restore byte-identical |
| mutation M4 — shrink all six inline budgets | caught (6x); restore byte-identical |
| mutation M5 — delete a table row | caught; restore byte-identical |
| mutation M6 — blind the reader to the positional spelling | caught; restore byte-identical |
| module-load probe | `collect 7.04s`, a 200 ms test budget does not fire |
| `check-user-guide.test.ts` after the restructure | 11 tests pass; collect 3.51 s → 32 ms |
| core suite | **120 files, 3233 tests passed** |

### A defect found in the mutation harness itself

M4 initially **survived**, which would have meant a hole in the gate. It did not.
The harness replaced only the *first* occurrence of an anchor that occurs six
times, so five budgets stayed at 30 000 and the gate — reading the largest budget,
correctly — still saw a compliant file. The mutation was a no-op wearing a
hole's clothes. The harness now states the expected multiplicity per mutation and
asserts the count it found, because "how many times does this anchor occur" is a
fact about the mutation, not an assumption to make.

### Not done

- **The standalone profile is not a gate.** Nothing re-measures these seven files,
  so a change that pushes a new file over the default is invisible until someone
  measures again. The table records the measurements that justified each row; it
  does not keep itself fresh.
- **No guard was built for the in-suite/standalone gap.** The 3.1x contention
  factor is a property of 32-way parallelism rather than a defect, and a rule
  asserting "the ratio has an upper bound" would have the same shape problem this
  finding is about. It is recorded here as the baseline for judging a future flake
  instead.
- **A test budget cannot bound a module-load spawn**, so the gate's rule is stated
  for the `it` argument and the `beforeAll` hook, but nothing detects a *new*
  top-level spawn. `check-user-guide.test.ts` is the only file that had one, and it
  no longer does.
- **The `hookTimeout` for a `beforeAll` was not exercised at its limit** — the
  budget exists to catch a hang and was never approached, so the number is
  justified by the same order-of-magnitude argument as `BULK_TIMEOUT_MS` rather
  than by an observed near-miss.

## Finding 128 — two "product flakes" were manufactured by the clean-up that was supposed to tidy up after them

Finding 127 closed with one failure unresolved: an intermittent
`expected 1 to be 0` in `check-official-roundtrip.test.ts`, green 40/40 in
isolation and red roughly one run in six under a full suite. This finding is what
it turned out to be, plus a second one found on the way, and both have the same
cause -- which is not in the product.

### The mechanism

Every fixture in this suite that needs a real tree creates it with `mkdtempSync`
under a **fixed prefix in `/tmp`**:

| prefix | written by |
| --- | --- |
| `/tmp/rca-bench-typecheck-<rand>` | `typecheck-entrypoint.test.ts` |
| `/tmp/rca-bench-gatetest-exclusion-<rand>` | `gate-test-battery-exclusion.test.ts` |
| `/tmp/rca-bench-<name>-<rand>` | the remaining mkdtemp fixtures |

A full-suite pass leaves **64** of these behind, because a killed run never reaches
its `afterAll`. They are cheap individually and were not cheap in aggregate: the
cgroup for this sandbox has a hard limit of 8192 MiB, and at the moment it was
measured the sandbox sat at 8149.8 MiB -- **42 MiB of headroom**, with
`memory.events` recording `max 280851` hits, `oom 513`, and `oom_kill 2`. A run
under that ceiling has an unpredictable process killed in it.

So the clean-up was justified. What was not justified was doing it **while a run
was in flight**. Issued at 03:29, `rm -rf /tmp/rca-bench-typecheck-*` deleted the
**live** cold worktree of a suite run that started at 03:29. `tsc` read a
half-deleted source tree and emitted

    src/export/aiops2025.ts(4,40): error TS2306: File '.../guard.ts' is not a module

seven times, once per exporter. The same command ran `git worktree prune`, which
deregisters a worktree whose directory is missing; that is the second flake.

### Why it read as a product defect

The error names a real file, `packages/core/src/export/guard.ts`, and a real
mistake -- `File ... is not a module` is exactly what a broken export list
produces. The repo copy was intact at 4950 bytes the whole time. Nothing in the
message says "the tree this ran in was deleted underneath it", because nothing can:
by the time `tsc` reports, the deletion has already happened.

The check that settles it takes one command and should have been the first one:

    wc -c packages/core/src/export/guard.ts    # 4950, unchanged

An earlier flake fell the same way. `scanned` alternated 35 and 36 across runs, and
I attributed it to a race in `derive-gate-sites.mjs` under load. The deriver fix is
correct on its own merits -- a dotfile is not a gate site, and
`gate-sites-are-proven.test.ts` now proves it with a mutation -- but the *flake*
was a `git worktree prune` deregistering a running test's worktree mid-run.

Measured after the interference was removed, with a 20 Hz poller watching every
cold worktree for a `guard.ts` that is not 4950 bytes: **four consecutive
full-suite passes, zero suspect observations, 3234 tests each**. The flake is gone
and no product code was changed to remove it.

### The rule

- **Never `rm -rf` under `/tmp` and never `git worktree prune` while a test runner
  is alive.** `pgrep -c -f vitest` must read 0 first. Clean before starting or after
  returning, never between.
- **A failure whose message names a file just touched on disk is a hypothesis about
  the operator before it is a hypothesis about the product.** Check the repository
  copy with `wc -c` before reading any test code.
- Clean-up that is *justified* is not therefore *safe*. The cgroup pressure here was
  real and the 64 orphans were worth removing; the defect was the timing, not the
  action.
- A fix for a flake that changes product code needs the flake reproduced **with the
  interference absent** before the fix can be credited. Two fixes here were written
  against a flake that neither of them caused.

### Coverage

| quantity | value |
| --- | --- |
| orphaned `/tmp` worktrees at measurement | **64** |
| cgroup hard limit | **8192 MiB** |
| cgroup usage at measurement | **8149.8 MiB** |
| headroom | **42.1 MiB** |
| `memory.events` `max` hits | **280851** |
| `memory.events` `oom` / `oom_kill` | **513 / 2** |
| full-suite passes with interference removed | **4 of 4**, 3234 tests each |
| suspect observations by the 20 Hz poller | **0** |
| product files changed to remove the flake | **0** |

### Verified

| check | result |
| --- | --- |
| `guard.ts` in the repository during the failure | **4950 bytes, intact** |
| failure reproduced with `git diff HEAD` path only | no — the diff does not touch `guard.ts` |
| failure reproduced by `pnpm install` in a cold tree | no |
| failure reproduced by `pnpm typecheck` in a cold tree | no — 0 `error TS` |
| failure reproduced by 12-way concurrent `coldCopy` | no |
| failure reproduced by deleting a live worktree mid-`tsc` | matches the reported symptom |
| `git worktree list` after clean-up | **1 entry**, the primary tree |

### Not done

- **The suite still leaks scratch directories.** 64 orphans is a property of killed
  runs, and nothing reaps them. A `globalSetup` teardown, or a prefix registered
  for removal at `beforeAll`, would bound it; neither is written.
- **No guard prevents the ordering mistake.** The rule lives in the workspace
  shell-rules file and in this finding, and a human or an agent can still issue the
  command. Nothing detects "a `/tmp` deletion overlapped a live run".
- **The cgroup headroom was not addressed.** The orphan removal recovered the
  space; it did not make 32 vitest workers fit under 8192 MiB. Whether the suite
  fits at full parallelism without the orphans was not re-measured, so the
  relationship between the memory ceiling and the runtime is still unmeasured.

## Finding 129 — a test file failed as a whole suite, and three separate checks reported the file as green

### The defect

`gate-sites-are-proven.test.ts` referenced `RULE_TIMEOUT_MS` at line 767 without
ever declaring it. The reference was in the second argument of an `it`, so it was
evaluated when the file was **collected**. The result was

    ReferenceError: RULE_TIMEOUT_MS is not defined
    FAIL  test/gate-sites-are-proven.test.ts [ test/gate-sites-are-proven.test.ts ]

which is a *suite*-level failure: all 28 tests in the file were discarded, and
vitest reported the file once rather than per test.

### Why it survived three green checks

The reference was in an **uncommitted** test added earlier in the same session.
That is what made it invisible for as long as it was:

| check run | what it read | result |
| --- | --- | --- |
| `vitest run packages/core/test/gate-sites-are-proven.test.ts --root .` through the root config | the working tree, which had the file | **passed, 29 tests** |
| the same test through `packages/core`'s own config | the working tree | **passed, 29 tests** |
| `pnpm --filter @rca-bench-factory/core test:coverage` | the working tree | **passed**, 121 files / 3239 tests |
| `pnpm --filter @rca-bench-factory/core test` | the working tree | **FAILED at collect** |

The last of those is the one that failed, and it is the one
`measure-doc-counts.mjs` spawns. `--coverage` and no-`--coverage` differ in the
reporter, and the suite-level failure was reported as a failed **file** rather
than a failed **test**, which the summary line of the coverage run did not
surface: a run that reports `Tests 3239 passed` while a file failed collection is
a run whose two numbers describe different things.

The general shape is finding 123's, one level down. A green summary line is a
claim; nothing was reading whether the *file* count agreed with the *test* count,
and the assertion that would have caught the difference is not one anybody would
write by default.

### The second defect, found by the first

Fixing the constant made `docs:counts` run far enough to reach
`typecheck-entrypoint.test.ts`, which then failed with

    expected [ Array(1) ] to deeply equal []
    Received: [ "scripts/.probe-figures-harness.mjs" ]

That is a genuine cross-test race, and it has the same cause as finding 128's:
`type-miss-probe.test.ts` creates `scripts/.probe-figures-harness.mjs` for the
duration of two tests, and `typecheck-entrypoint.test.ts` enumerated the untracked
files while it was there. The completeness assertion compared that enumeration
against one taken earlier, at copy time, when the file did not exist. **The
assertion compared two readings of a directory that was changing underneath it,
and reported the difference as a defect in the copy.**

The repair is to assert over the paths the copy actually took rather than to
re-enumerate. `coldCopy()` now returns `{ sandbox, copied }`, and the assertion
reads `copied`. That is the only reading that describes an event which already
happened.

Proven in the failing condition: with the transient file held in place for the
whole run, `typecheck-entrypoint.test.ts` passes **4 of 4** where it previously
failed.

### Coverage

| quantity | before | after |
| --- | --- | --- |
| `gate-sites-are-proven.test.ts` as a file | **failing at collect**, 0 of 28 tests run | **29 tests pass** |
| `typecheck-entrypoint.test.ts` with the scratch file held | **failed** | **4 of 4 pass** |
| declared budgets in `gate-sites-are-proven.test.ts` | 0 | **1 (`RULE_TIMEOUT_MS`)** |
| rows in `doc-counts.json` that were stale | **3 of 3** | **0** |
| `progress.md` current-state rows disagreeing with the suite | 3 | **0** |
| `pnpm docs:check` | failed | **clean, 7 guards** |

### Verified

| check | result |
| --- | --- |
| `RULE_TIMEOUT_MS` declared | `const RULE_TIMEOUT_MS = 30_000` |
| `gate-sites-are-proven.test.ts`, root config | **29 tests pass** |
| `gate-sites-are-proven.test.ts`, core config | **29 tests pass** |
| `typecheck-entrypoint.test.ts`, no interference | **4 tests pass** |
| `typecheck-entrypoint.test.ts`, scratch file held | **4 tests pass** |
| `pnpm docs:counts` | rc 0; wrote `core 121/3239`, `cli 3/173`, `repo 124/3412` |
| `pnpm docs:check` | clean |
| `golden-master/doc-counts.json` | regenerated; matches the suite |

### Not done

- **`timeout-budget.test.ts` cannot see a missing budget.** It scans for budgets
  and checks the largest one is above the default; a file that *references* an
  undeclared constant has no budget for it to find. The reader's rule is
  "every stated budget is large enough", which says nothing about a stated budget
  that does not exist. Closing this needs a different instrument -- a type-check
  of the test sources, or a lint rule for an undeclared identifier -- and neither
  is wired up.
- **A suite-level collection failure does not fail the run's summary line.** The
  coverage run printed `Tests 3239 passed` while a file had failed to collect. The
  file count and the test count came from different places and nothing reconciled
  them. `check-doc-counts` compares the *published* counts to a live measurement,
  so it would catch a stale claim, but nothing asserts that a run with any
  `FAIL [ file ]` line also fails.
- **The `typecheck-entrypoint` fix rests on `copied` being populated.** The
  positive control is `copied.length > 0`, which is satisfied by the committed
  tree; it does not prove that a file which *should* have crossed did. The
  original defect -- `git diff` alone reproducing half the working tree -- would
  still be caught, because the missing file is not in `copied` and a reader
  looking for it there finds nothing. That is a weaker check than the assertion it
  replaced, and it is weaker for a reason: the stronger one was measuring a
  directory in motion.

## Finding 130 — a missing binary was read as a verdict, and CI is where that was visible

The v1.63 push went red on two jobs. Both failures were in code added in the same
session, and both were the same mistake at different levels: **a check reporting a
verdict about something it had never actually observed.**

### Defect 1 — `zsh` absent, read as `zsh` rejecting `${a}`

`check-no-unsafe-shell.test.ts` cross-checks the gate against the two shells it
models, and it did so through

```js
function shellRejects(shell, expansion) {
  const r = spawnSync(shell, ['-c', `${PROBE}echo "${expansion}"`], { encoding: 'utf8' });
  return r.status !== 0;
}
```

`spawnSync` returns `status: null` when the binary does not exist, and
`null !== 0` is `true`. **A shell that was not installed was therefore reported as
a shell that rejected the expansion.**

Measured on `ubuntu-24.04`, run 37837481091, in both jobs:

    AssertionError: zsh rejected ${a}: expected true to be false

`${a}` is the simplest legal expansion in the language. It failed on the *first*
entry of the well-formed list, which is the signature of an absent binary: every
entry fails identically and the first is the one the reporter names. It passed in
this sandbox because this sandbox has zsh 5.9 -- so the defect was invisible to
every local run and to every one of the 3240 green tests.

The repair distinguishes the two facts a verdict can rest on:

| function | returns | meaning |
| --- | --- | --- |
| `shellAvailable(shell)` | `boolean` | the shell ran |
| `shellRejects(shell, expansion)` | `boolean \| null` | `null` when the shell is not installed |

and a new test asserts availability *before* the two comparisons, so a runner
without a shell fails with **`zsh is not installed on this runner`** rather than
with a verdict invented from an ENOENT.

Proven by hiding the binary: with a `PATH` containing `bash`, `node` and the core
utilities but not `zsh`, the file now reports

    × both shells are installed, so the cross-check below has something to compare against
      → zsh is not installed on this runner: expected false to be true
    × both shells accept every well-formed expansion, so the gate is not over-strict
      → zsh rejected ${a}: expected null to be false

The second message changed from `expected true to be false` to
`expected null to be false`, which is the difference between an assertion about
the shells and an assertion about `spawnSync`.

### Defect 2 — a control that asserted a property of the developer's tree

`typecheck-entrypoint.test.ts` gained a positive control, `copied.length > 0`,
intended to keep the completeness assertion from being vacuous. CI answered

    AssertionError: expected 0 to be greater than 0

**and the control was wrong, not the copy.** A fresh checkout has no untracked
files: `git ls-files --others` returns nothing, `attempted` and `copied` are both
legitimately empty, and the copy reproduced the whole working tree precisely
because there was nothing extra in it. The control asserted a property of the
**developer's working tree** -- which is dirty here and clean on CI -- and not of
the copy step it was guarding.

It is now a comparison rather than a magnitude. `coldCopy()` returns
`{ sandbox, copied, attempted }`, and the test requires `copied === attempted`,
which is empty-on-empty on a clean tree and non-empty-on-non-empty here. That
still catches the defect the fixture exists for, because a file that `git diff`
alone would have missed is absent from `copied` and shows up in `shortfall`.

### Coverage

| quantity | before | after |
| --- | --- | --- |
| tests in `check-no-unsafe-shell.test.ts` | 19 | **20** |
| shells distinguished from ENOENT | 0 of 2 | **2 of 2** |
| `typecheck-entrypoint` controls that hold on a clean tree | **0** (it failed on CI) | **1** |
| core test files / tests | 121 / 3239 | **121 / 3240** |
| CI jobs green on the fix | 0 of 3 | pending |

### Verified

| check | result |
| --- | --- |
| `check-no-unsafe-shell.test.ts` with `zsh` present | **20 tests pass** |
| `check-no-unsafe-shell.test.ts` with `zsh` hidden | fails with **`zsh is not installed on this runner`** |
| that failure's second message | `expected null to be false`, no longer `expected true to be false` |
| `typecheck-entrypoint.test.ts`, dirty tree | **4 tests pass** |
| `coldCopy()` return | `{ sandbox, copied, attempted }` |
| core suite | **121 files, 3240 tests passed** |
| core coverage | `99.96 / 99.91 / 100 / 99.96` |
| `pnpm typecheck` / `lint` / `docs:check` | clean |

### Not done

- **The fixture was not run on a clean tree locally.** The fix is argued from
  CI's failure and from the mechanism, not from a local reproduction of the clean
  state; the sandbox working tree is dirty and making it clean would have
  discarded the session's work. The assertion is expected to hold because it no
  longer compares against a non-zero bound, but that reading is deduced.
- **Nothing checks shell availability for the other spawns in the suite.** This
  fixture is the only one whose subject is a second program, so it is the only one
  where the distinction matters today -- and that is a statement about the suite
  as it is, not a guard that would catch the next one.

## Finding 131 — the gate had the rule right, and the error it was written to prevent happened anyway, because the gate reads files and the error was in a command

### The defect

The third recurrence of the same interruption, reported verbatim:

> Failed to run function tools: Error: Bad substitution: Math.floor

`check-no-unsafe-shell.mjs` already existed for exactly this error. It was wired
into `pnpm lint`, it had 20 tests, and its rule had been cross-checked against
`zsh` and `bash` on 28 constructs with 0 mismatches. So the obvious reading --
"the gate does not catch this one" -- is wrong, and it was wrong twice in this
session before it was measured.

The gate is not a reader of commands. It is a reader of **files**:

    DEFAULT_SCAN_ROOTS = [resolve(ROOT, 'scripts'), resolve(ROOT, '.github', 'workflows')]

A tool call is a shell string that is *never committed*. It is not a script, it
is not a workflow step, and it is not an input to anything. The path a command
actually takes is

    intent -> shell string -> shell -> program

and every gate in this repository reads at most the second step, and only for
material that reached the tree. The failing command was one step to the left of
everything the repository could observe. This is the class of findings 104-130
-- *a claim with no reader* -- reached by walking outward past the repository
boundary, where the reader was never installed because there was nothing to
install it into.

### The measurement that located it

Before changing anything, three candidate explanations were tested against the
real gate rather than reasoned about:

| hypothesis | measurement | verdict |
| --- | --- | --- |
| the rule does not recognise `${Math.floor(1.5)}` | gate on a file holding it: **exit 1**, `bad-substitution` | refuted |
| the gate misses it because it is inside a nested interpreter | gate flags **both** `bad-substitution` and `nested-interpreter-expansion` | refuted |
| the 39 `bash` fenced blocks in the Markdown are unguarded | extracted all **231** shell-tagged blocks across the 19 `.md` files and ran the gate over each: **0 flagged** | refuted, and usefully so |

The third row is the one that mattered. It would have been easy to "fix" this by
extending the scan roots to Markdown, and that gate would have been a check that
catches nothing -- the same shape as the defect. `check-user-guide.mjs` already
*executes* every `bash` fence in the user guide in document order and enforces
the tag contract in both directions, so the docs were covered by a stronger
instrument than the one being proposed.

What was left, after two refutations and one null result, was the position in
the pipeline: the gate had no way to read a command *before* it ran.

### The fix

`--stdin` mode. The same rule, applied to a command that is not yet a file:

    printf '%s' "$cmd" | node scripts/check-no-unsafe-shell.mjs --stdin --label 'tool-call'

Verified on the reported string:

    node -e "console.log(${Math.floor(1.5)})"
      tool-call:1:22  bad-substitution
      tool-call:1:21  nested-interpreter-expansion

and on the corrected spelling, which passes. The rule is deliberately *not*
relaxed for this mode. A second, laxer predicate for "a command a human typed"
would be two readers of one claim disagreeing, which is the finding this file
has spent thirty entries describing.

### The defect the fix had first, which is the same finding one level in

The first draft of `--stdin` printed `OK` for the failing command. The
mechanism:

    function targets() { ...; if (process.argv[i] === '--stdin') stdinMode = true; ... }
    ...
    if (stdinMode) { checkStdin(); }      // line 441 -- stdinMode is still false
    for (const file of targets()) { ... } // line 445 -- only here does it become true

The flag was read **before** the only call that set it. `--stdin` therefore
selected no files and checked no input, and the gate reported a verdict about
something it had never read -- findings 123-130's exact shape, reintroduced
*inside the fix for it*, by the same author, in the same hour.

It was found by running the mode on the input it was written for instead of
reading the diff. Six of the nine tests added for the mode fail against it;
`--stdin` is now parsed into `selected` before either branch consumes it.

### Verified

| check | result |
| --- | --- |
| `check-no-unsafe-shell.test.ts` | **29 passed** (was 20; +9 for `--stdin`) |
| M1 — read the flag before `targets()` sets it | **caught**, 6 of 9 new tests fail |
| M2 — drop `--label` assignment | **caught**, 1 test fails |
| M3 — check only the first line of a command | **caught**, 2 tests fail |
| restore | byte-identical, `sha256 4ed6766f9bbc038d` |
| `typecheck` / `lint` / `docs:check` | clean |
| `docs:counts:check` | clean, core **121 / 3265**, cli 3 / 173, repo **124 / 3438** (Pass 39, `16f3499a9`) |
| `derive-gate-sites` | 41 sites, exit site moved 438 -> 497, `status` restored |
| `examples:check` / `examples:bundle:check` / `official:check` | clean |

### Not done

- **Nothing runs `--stdin` automatically.** It is a capability, and using it is
  a discipline: an agent that does not pipe its command through the gate is
  exactly as exposed as before. There is no hook between "a command is composed"
  and "the command runs" that this repository controls, so the mode cannot be
  made mandatory from inside the repository.
- **The gate cannot see a command it was not shown.** `--stdin` closes the
  channel for a caller that uses it; it does not close the channel for a caller
  that does not. That is the honest limit of a fix at this layer.

### Correction, added while writing up finding 134: the `arr[${i}]` paragraph was wrong

This section used to say that `arr[${i}]` "is flagged by the gate and accepted
by `zsh -n`", and that "`zsh` is the stricter parser". Both halves were measured
afterwards and both were wrong the way round they were stated:

    node scripts/check-no-unsafe-shell.mjs --file <'echo "${arr[${i}]}"'>   -> OK   rc=0
    node scripts/check-no-unsafe-shell.mjs --file <'echo "${a.b}"'>         -> FAILED rc=1, bad-substitution
    zsh -c 'echo "${a.b}"'                                                  -> bad substitution
    bash -c 'echo "${a.b}"'                                                 -> bad substitution

The gate does **not** flag `arr[${i}]` -- the inner `${i}` is a legal expansion,
and the outer group's operator is `[`, which the rule allows -- and `zsh` is not
more permissive here: `zsh` rejects `${a.b}` at *runtime* exactly as `bash` does.
The claim had been in this file for one commit and had no reader, which is this
file's own subject matter arriving in its own text.

The paragraph's conclusion -- that a third `kind` for "accepted by the parser,
silently empty at runtime" might be worth adding -- is therefore about a case the
gate does not currently report at all. It is recorded as open rather than
resolved: a construct that a shell accepts and then expands to the empty string
is the quietest failure in the family, and nothing in this gate looks for it.

## Finding 134 — the caller passed a positional path and selected nothing, and the gate said OK

A diagnostic pass while writing up this finding ran, in this order:

    node scripts/check-no-unsafe-shell.mjs t1.sh                       -> OK  rc=0
    node scripts/check-no-unsafe-shell.mjs /tmp/bs-probe/z.sh          -> OK  rc=0
    node scripts/check-no-unsafe-shell.mjs --file /tmp/bs-probe/z.sh   -> FAILED  rc=1

The first two lines were read as *the gate does not flag `${a.b}`*. That reading
was wrong, and the third line is what refuted it: the same file, the same gate,
the same second, two different verdicts, and the only difference is the flag.

### What the gate does with a positional argument

    node scripts/check-no-unsafe-shell.mjs t1.sh

`targets()` reads only `--root`, `--file`, `--stdin` and `--label`. A positional
argument matches none of them, so `files` is empty, `roots` is empty, and the
scan falls through to

    const scan = roots.length > 0 ? roots : DEFAULT_SCAN_ROOTS;

which is `[scripts, .github/workflows]` -- the committed tree. The gate scans the
tree, the tree is clean, and it prints `OK`. It is a **correct** verdict about the
subject the gate chose, and a **false** verdict about the subject the caller
named. The command is plausible enough to be typed by anyone: the gate's own
documented invocation for a single file is `--file`, and a positional path is what
`eslint`, `tsc` and every other checker in the repository accept.

This is the finding of this file again -- *a claim that is published and that
nothing reads* -- reached from the **caller's** side instead of the callee's. The
gate's reader for `--file` is real and tested; the caller used a spelling that has
no reader at all, and the failure mode of a spelling with no reader is not an
error but silence.

### Why it took a second measurement to see

The verdict was refuted immediately by running the *supported* spelling. The
uncomfortable part is that the first two commands were not compared against a
positive control before the conclusion was drawn from them: an `OK` was read as
evidence about the file rather than about the scan set. The repair is not "be more
careful". A gate whose silent mode is *scan everything else* has no way to tell
the two apart at the point where it matters, so the caller cannot tell either.

### The fix

An unrecognised argument is now an error rather than a no-op:

    } else if (process.argv[i] !== undefined) {
      unknownArguments.push(process.argv[i]);
    }

reported before any scanning happens, and the same for an argument-shaped value
missing after `--root` / `--file` / `--label` (the previous `--root` followed by
nothing consumed the empty remainder and scanned the default roots silently).
A caller who typed a path now gets

    check-no-unsafe-shell: FAILED
      unrecognised argument: t1.sh
      a file or directory is named with --file / --root; a command is piped with --stdin

which names the mistake and the supported spellings. Measured after the fix:

| command | before | after |
| --- | --- | --- |
| `... --file <defective>` | FAILED rc=1 | FAILED rc=1 (unchanged) |
| `... t1.sh` (positional) | **OK rc=0** | **FAILED rc=1, `unrecognised argument`** |
| `... <defective>` (positional) | **OK rc=0** | **FAILED rc=1** |
| `... --root` (no value) | OK rc=0 | FAILED rc=1 |
| `... --file` (no value) | OK rc=0 | FAILED rc=1 |
| `...` (no arguments) | OK rc=0, tree scanned | OK rc=0 (scan unchanged) |
| `... --stdin <defective>` | FAILED rc=1 | FAILED rc=1 (unchanged) |

The last row is the one that had to stay: the default no-argument invocation is
what `pnpm lint` uses, and it must keep scanning the tree.

### The guard, and the mutation that proves it reads

Five tests were added to `check-no-unsafe-shell.test.ts`, one per rejected
argument shape plus the no-argument control. The mutation is the revert of the
`unknownArguments` branch:

    M — restore the silent fall-through (drop `unknownArguments.push`)
      × rejects a positional argument instead of silently scanning the tree
      × rejects a positional argument even when it names a real defective file
      × rejects a dangling --root with no value
      × rejects a dangling --file with no value
      Tests  4 failed | 31 passed (35)

The no-argument control passes under the mutation, which is the point: it is the
positive control that says the fix did not break the supported invocation, and it
is the assertion that would have caught over-reach -- a fix that rejects
everything would fail it.

### Not done

- **`--stdin` still has no automatic invoker**, unchanged from finding 131. This
  finding is adjacent but distinct: 131 was "the gate was never shown the
  command", 134 is "the gate was shown a path and scanned the tree instead".
- **The other five gates in `pnpm lint` were not audited for the same spelling.**
  `check-no-mock.mjs`, `check-no-secrets.mjs`, `check-no-vendored-data.mjs`,
  `check-no-absolute-paths.mjs` and `check-official-registry.mjs` are all invoked
  with no arguments, so the question does not arise for the invocations this
  repository uses -- but it is exactly the question `dnf`'s "did you mean" and
  `eslint`'s "no files matching" exist to answer, and none of the five was
  measured.

## Finding 135 — the gate answered, and the caller's own command line deleted the answer

Running the gate once as

    node scripts/check-no-unsafe-shell.mjs --file /tmp/bs-probe/z.sh | head -5

printed `OK` for a file that the identical command **without** the pipe rejected
with `bad-substitution`. Nothing in the gate was involved. A pipeline's exit
status is the status of its **last** command, and `head -5` exits 0, so the
pipeline exits 0 and every reader downstream -- a shell, an agent, a CI step under
`set -e` -- sees success.

    $ gate --file <defective>            ; echo $?   ->  1
    $ gate --file <defective> | head -5  ; echo $?   ->  0
    $ gate --file <defective> > /dev/null; echo $?   ->  1
    $ set -o pipefail; gate ... | head   ; echo $?   ->  1

### The three-part chain this completes

| # | what happened to the verdict | finding |
| --- | --- | --- |
| 1 | the gate was never shown the command -- it reads files, and a tool call is not a file | 131 |
| 2 | the gate was shown a path, matched no flag, and scanned the committed tree instead | 134 |
| 3 | the gate answered correctly and the **caller's pipeline** replaced its status with `head`'s | 135 |

Each was found by the previous one's investigation, and each is the same
statement -- *a check whose answer nothing reads* -- at one further remove from
the rule. After 131 the rule had 30 tests and was not the problem. The problem
had already left the rule behind, and none of the three was reachable by adding
a construct to `MALFORMED`.

### The fourth occurrence, and the guard that was designed and then deleted

`Bad substitution: new` interrupted a tool call while this finding was being
written up. The construct was in a heredoc, and the design that came out of it
was a pipeline guard: refuse when stdout is a pipe, so a caller cannot discard
the status into `head`.

**It was implemented, and then removed, because the measurement refuted it.**
`/proc/self/fd/1` cannot distinguish the cases:

| invocation | `/proc/self/fd/1` | distinguishable? |
| --- | --- | --- |
| run directly (captured by this harness) | `other` | -- |
| `\| head -5` | `fifo` | **no** -- identical to the two below |
| `\| cat` | `fifo` | **no** |
| `\| tee log` | `fifo` | **no** |
| `> file` | `file` | yes |
| `$(gate ...)` | `fifo` | **no** |

`head` is indistinguishable from `cat` and `tee` at the fd level. A second
design read `-c` from `process.argv` to recover the pipeline text, and was also
refuted by measurement: when a shell runs `gate ... | head`, the shell parses the
pipeline itself and `argv` is `[".../check-no-unsafe-shell.mjs", "--file", "..."]`
-- there is no `-c`, and the pipeline is not visible to the process in any way.

A guard that fires on `| cat` and `| tee` would break deliberate inspection; a
guard that fires on nothing is this finding one level deeper. **It was deleted
rather than shipped**, and the deletion is recorded here because a guard written,
tested against an idea of the behaviour, and kept would have been worse than no
guard: it would have been a claim with no reader, in the file about claims with
no reader.

### What was kept: the property that made the remedy composable

The reflex may be to reach for `PIPESTATUS`, or to conclude that POSIX
pipelines are unsolvable. Neither is the right lesson. The productive question
is the one this pass had never asked:

> **Does the remedy compose?**

The remedy had existed for three findings and could not have fired for one
reason that covers all three -- **it was always composed inside the command it
was meant to check.** `--stdin` requires

    printf '%s' "$cmd" | node scripts/check-no-unsafe-shell.mjs --stdin && eval "$cmd"

and that composition is itself a shell string that nothing checks. `--stdin`
mode was exempted from the pipeline guard precisely because it *is* a pipeline
member, so the invocation was allowed -- and it still had to survive the shell
that ran it.

So the one change that was kept is the one that makes the remedy usable as a
component: **a pass prints nothing on stdout when stdout is not a terminal.** A
terminal is a human, who wants the line; a pipe or a file is a program, or a
transcript a program will compare, and a program wants quiet.

| case | before | after |
| --- | --- | --- |
| run at a terminal | `check-no-unsafe-shell: OK` | unchanged |
| stdout piped or captured | `check-no-unsafe-shell: OK` | **silent**, exit status only |
| stdout redirected to a file | `check-no-unsafe-shell: OK` | **silent** |
| a failure | report on stderr, rc=1 | unchanged |

Measured after the change:

    $ gate --file <clean> && echo RAN          -> RAN, rc=0
    $ gate --file <defective> && echo RAN      -> no RAN, rc=1
    $ OUT=$(gate --file <clean>)               -> OUT empty, rc=0
    $ gate --file <defective> >/dev/null       -> rc=1, report on stderr

This is the change that should have been made after finding 131. It is small, it
is not about the shell rule at all, and it is the difference between a gate that
exists and a gate that is *used*: `gate ... && run-the-thing` is now a single
line a caller can write without thinking about pipelines.

### Verified

| check | result |
| --- | --- |
| `check-no-unsafe-shell.test.ts` | **41 passed** |
| M8 -- print `OK` unconditionally | **caught** -- 2 tests fail |
| M9 -- `stdoutIsTerminal()` always `true` | **caught** -- 2 tests fail |
| restore | byte-identical, `sha256 4b678ed456703838` |
| positional path | rc=1, `unrecognised argument` |
| dangling `--file` / `--root` / `--label` | rc=1 for each |
| no arguments | rc=0, tree scanned |
| `--stdin` fed by a pipe | rc=0, unchanged |

### Not done

- **A pipeline guard was designed, implemented and deleted.** The deletion is
  the finding, not an omission: `/proc/self/fd/1` and `process.argv` were both
  measured and neither can see the pipeline. A caller who writes
  `gate ... | head` still discards the status; what changed is that the caller
  no longer needs to write that, because `gate ... && cmd` is now quiet.
- **`PIPESTATUS` is a caller-side remedy and is not enforceable here.** No test
  can assert something about a command the repository never runs, which is
  finding 131 stated once more.

### Not done

- **The pass-line rule is `/proc`-specific.** `stdoutIsTerminal()` falls back to
  `true` where `/proc` is absent, so on macOS the pass line prints even when piped
  and the composability property is lost there. The fallback is deliberate -- an
  unreadable environment must leave the tool behaving as it always did rather than
  silently changing shape -- but it does mean the property is only *tested* on
  Linux, which is where CI runs.
- **No test asserts the fallback branch.** It cannot be reached on Linux, and
  reaching it would require a mock -- which `check-no-mock.mjs` forbids in this
  repository, for the same reason this file exists.

## Finding 136 — the job named "no build" builds, and its flake is the build racing its own tests

`test/fault-extraction-scripts.test.ts` failed in CI on the push for finding 135:

    expected 'fatal: The requested module './cli/a…' to match /read here and nowhere else/

and passed on re-run. Before any theory, the run history was checked, because a
single failure is not evidence of a mechanism:

- the same assertion is present in **6 of the last 7 failing runs** on this
  repository;
- in run #174 it appeared **five times in one job**, alongside four *different*
  module-link errors:

```
fatal: The requested module '../export/itbench.js' does not provide an export named 'ITBENCH_SCENARIO_CLASSES'
fatal: The requested module './cli/args.js' does not provide an export named 'CLI_VERSION'
fatal: The requested module './score/score.js' does not provide an export named 'SCORE_TARGET_IDS'
fatal: The requested module './official.js' does not provide an export named 'parseOpenRcaScoringPoints'
```

Four modules, four names, one job, intermittent. That is not a defect in any of
the four modules.

### The mechanism

The workflow's `cold-tree` job is documented at length as *"a `pnpm build` step
here would make this job green and measure nothing"*, and it does not contain
one. It contains

```yaml
- name: Test, from a tree that has never been built
  run: pnpm test
```

and `pnpm test` has a `pretest` hook:

```json
"pretest": "pnpm build",
"test": "pnpm --filter @rca-bench-factory/core test && pnpm --filter @rca-bench-factory/cli test"
```

Read from the job's own log, the count of `tsc -p tsconfig.json` invocations is
**6**. The tree is built before it is tested, by the hook, in the job whose
entire stated purpose is that the tree is not built.

So the job is not testing what it says it tests, and the failures come from the
thing the job claims not to do: `tsc` writes `dist/` incrementally, the suite
spawns scripts that import `dist/`, and a script that starts during that window
dies at link time on whichever module `tsc` has not reached yet. Which module
that is varies per run, which is why #174 shows four different ones.

The "no build" claim is not merely imprecise. `cold-tree-job.test.ts` asserts the
*absence of a build step in the YAML*, a check that reads the file and confirms
what it was written to confirm -- the finding this repository keeps producing,
here in the guard for the job that measures preconditions.

### What was established and what was not

| statement | status |
| --- | --- |
| the failure is intermittent, not deterministic | **established** -- 6 of 7 failing runs, and a clean re-run |
| it affects several modules at once, so it is not a module defect | **established** -- run #174 |
| `cold-tree` invokes `tsc` 6 times | **established** -- the job's own log |
| a tree with no `dist` fails 168 tests, not 4 | **established** -- measured on a fresh `git archive` checkout |
| the window between `tsc` start and a complete `dist` is what the 4 tests hit | **not established** -- inferred from the shape, not reproduced |

### Four wrong measurements I made before the history was checked

Recorded because it is this file's subject matter, and because a reader should
know which of the numbers above to trust.

| claim | what the measurement actually showed |
| --- | --- |
| "a ~700 ms window where `dist/index.js` loads but is missing exports, 8 of 8 polls" | the probe asserted `runCli` and `parseArgs` -- **two names that exist nowhere in the source or in `dist`**. It reported `PARTIAL` for a complete, correct build. Re-measured against the real export list: **0 partial readings in 3 trials** |
| "the window reproduces on every trial" | every trial used the same non-existent names |
| "`rename(2)` makes the swap atomic" | measured after implementing it: `rename` onto an existing non-empty directory fails with `ENOTEMPTY`, so the "atomic" swap was a `rmSync` followed by a rename -- the same window, renamed |
| "the guard in the assertion improves the diagnosis" | measured: the report is byte-identical with and without it, because the matcher fails on the same line either way. Deleted rather than kept |

The build-staging script written on the strength of the first three claims was
**reverted**. After the probe was corrected it had no measured effect, and a
change that cannot be shown to do anything is not a fix.

The lesson is the one this repository applies everywhere else and which was not
applied here: a probe must be validated against a **known-good input** before its
output is read as evidence. The four claims above were reported to the user
before that check was made.

### Not done

- **Six other scripts in `cold-tree` were observed failing in the same run #174**
  and were not examined individually. The job no longer runs a suite at all (see
  finding 139), so the exposure is gone, but the individual readings were never
  taken and the count stands as the evidence.

### Resolved by findings 137-139

- **The flake is fixed at the source.** `--config.enable-pre-post-scripts=false`
  on every step that could reach a hook (finding 137), so `pretest` cannot build
  the tree out from under the job that exists to run without one.
- **`cold-tree-job.test.ts` no longer reads the YAML for the word `build`.** It
  resolves each command through the hooks that command would actually trigger,
  compares the suppression flag as an exact string, reconciles the cold aggregates
  against the measured set, and is caught by 11 of 11 mutations (finding 138).
- **The job's content was impossible and is now true.** Three of the seven
  `docs:check` members and one of the seven `lint` members import `dist`, so the
  aggregates could never pass cold; the job now calls `docs:check:cold` and
  `lint:cold`, which are first-class aggregates holding only the measured members
  (finding 139).

## Finding 137 — the flag the fix was built on suppresses a different class of script, and the choice was reported before it was measured

Finding 136 left the fix as an open decision and named three candidates. The
decision taken was to disable the `pre*` hooks inside the container, implemented
as `pnpm --ignore-scripts <script>` on the five `cold-tree` steps. It was
implemented, and it was reported to the user as working.

It does not work. Measured against a two-script probe package:

```json
{ "scripts": {
    "prehello": "node -e \"...appendFileSync('/tmp/ign/log','HOOK\\n')\"",
    "hello":    "node -e \"...appendFileSync('/tmp/ign/log','MAIN\\n')\"" } }
```

| invocation | `/tmp/ign/log` |
| --- | --- |
| `pnpm hello` | `HOOK`, `MAIN` |
| `pnpm --ignore-scripts hello` | `HOOK`, `MAIN` |

The hook ran in both. Measured again against this repository, on a tree with
`packages/*/dist` removed:

```
$ pnpm --ignore-scripts typecheck
> rca-bench-factory@0.1.0 pretypecheck .../rca-bench-factory
> pnpm --filter @rca-bench-factory/core build
> @rca-bench-factory/core@0.1.0 build .../packages/core
> tsc -p tsconfig.json
...
$ ls packages/core/dist | wc -l
18
```

`--ignore-scripts` suppresses `install` and `prepare` scripts. `pre<name>` and
`post<name>` are not in that class, and the name invites the opposite reading,
which is presumably why it was reached for and why the reading was not checked.

The flag that does suppress them, established by the same method:

```
$ rm -rf packages/core/dist packages/cli/dist
$ pnpm --config.enable-pre-post-scripts=false typecheck
> rca-bench-factory@0.1.0 typecheck .../rca-bench-factory
> pnpm --filter @rca-bench-factory/core typecheck && ...
$ ls packages/core/dist | wc -l
0
```

`pretypecheck` is absent from the output; no process ran it. This is the flag the
workflow now uses, and it is asserted in `cold-tree-job.test.ts` as an exact
string rather than as the presence of a flag -- because mutation M1b replaced
`=false` with `=true` and a substring check on the flag's *name* passed while the
job built.

### The mistake, stated plainly

The user was told "`--ignore-scripts` does not work; `--config.…=false` does"
**before either had been measured** — the second was inferred from the first
failure, not measured. In the same session, the first was reported as working
before *it* was measured. That is finding 136's lesson — a probe must be
validated against a known-good input before its output is read as evidence —
repeated one turn after it was written down.

The difference this time is what caught it: the probe had a **control arm**.
`pnpm hello` was run beside `pnpm --ignore-scripts hello`, and the control
produced the same output as the treatment. Without the control the single
treatment reading would have been read as "the flag has no effect" *or* as "the
hook fired", depending on which was assumed, and neither would have been a
measurement of the flag.

## Finding 138 — the guard satisfied itself with its neighbours, and three mutations showed it

Finding 136's guard was written to catch a build arriving through a lifecycle
hook. Rebuilt from a hand-written list, it was then measured against mutations
of the thing it guards. The first battery reported **three survivors** — and
every one of them turned out to be a *mutation* that had silently failed to
apply, because the shell function applying it used broken quoting. Re-run through
Python with an assertion that the text actually changed, **11 of 11 mutations are
caught**:

| mutation | result |
| --- | --- |
| add `pnpm test` back into the job | caught — 2 fail |
| add `pnpm build` into the job | caught — 2 fail |
| add `pnpm typecheck` (its `pretypecheck` compiles) | caught — 1 fail |
| add `pnpm lint` | caught — 2 fail |
| remove a cold-safe guard from the aggregate | caught — 1 fail |
| delete the `cold-tree` job | caught — 6 fail |
| call the warm `docs:check` instead | caught — 3 fail |
| flip `=false` to `=true` | caught — 1 fail |
| rename the step that runs the rule file | caught — 1 fail |
| substitute an unmeasured script | caught — 2 fail |
| route a guard through a package script instead of `exec` | caught — 2 fail |

The finding is not the survivors, which were artefacts. It is the **method**: a
mutation battery whose mutations are applied by a shell string reports
`SURVIVED` for a guard it never exercised, and `SURVIVED` reads as a defect in
the guard. Three of these were diagnosed as guard gaps and "fixed" before the
mutation harness itself was checked — the same shape as the finding this file
records under 128, where the machinery that was supposed to tidy up manufactured
the failures it then reported.

An inert mutation is indistinguishable from a survivor unless the harness
asserts that the edit landed. It now does, via `assert s2 != s`.

## Finding 139 — the cold-safe subset had to be an aggregate, because two correct rules met at the job

Making the `cold-tree` job run only the guards measured green without a build
meant naming them in the workflow. `ci-reaches-doc-guards.test.ts` failed on the
first push, and it was right to.

That file exists because v1.52 added `check-l4-status.mjs` to `docs:check`,
verified it green locally, and **CI never ran it** — the job named doc guards one
at a time, so the aggregate was a local-only channel. Its rule is that the
workflow must call `pnpm docs:check` and must not name any member of that
aggregate itself. A cold-safe hand-maintained list is still a hand-maintained
list, and the guard does not care why the list was written.

The two rules are both correct and they met head-on:

| rule | source | what it requires |
| --- | --- | --- |
| the job must not build | finding 136 | no step may reach a build |
| the job must not name guards by hand | `ci-reaches-doc-guards` | the workflow calls an aggregate |

Neither could be dropped. Calling `docs:check` satisfies the second and fails the
first, because three of its seven members import `dist`. Naming the four cold
ones satisfies the first and fails the second, which is what happened.

### The resolution

`docs:check:cold` and `lint:cold` are **aggregates in `package.json`**, exactly
as `docs:check` and `lint` are. The workflow calls a script name, so the
hand-maintained list is gone from the workflow and membership lives where
membership already lives. Both rules hold:

- `ci-reaches-doc-guards.test.ts` — 25 tests, green;
- the job reaches the cold membership without naming a single guard;
- `cold-tree-job.test.ts` reconciles the two aggregates against the measured set
  and fails if a member is added without a measurement.

Neither aggregate declares a `pre*` hook, and that is asserted separately rather
than left implicit. A hook there would be invisible to CI — the step carries the
suppression flag, so it would not fire — while still firing for any developer who
ran `pnpm docs:check:cold` by hand, which is the shape of finding 136 with the
observability removed.

### What the job now is, measured

| step | cold result |
| --- | --- |
| `docs:check:cold` | rc=0 |
| `lint:cold` | rc=0 |
| `cold-tree-preconditions.test.ts` + `cold-tree-job.test.ts` | 18 passed |
| `dist/` file count, start to end | **0** |

And what it is not: on a tree with no `dist`, `pnpm test` fails **173 tests
across 19 files**. The suite as a whole is warm-tree; the job no longer pretends
otherwise, and the count is recorded here so the next person does not have to
rediscover it.

## Finding 140 — A worktree registration leaked, and the suite failed in bursts

### What was seen

`pnpm test:coverage` on the full 121-file suite failed intermittently with

```
 FAIL  test/check-official-roundtrip.test.ts > scripts/check-official.mjs · a declared case with no readable payload > reads a payload the corpus named data.csv, which is what upstream writes
AssertionError: the round trip rejected a corpus it accepts in isolation
```

and, on other runs, with a *different* file and a *different* test:

```
 FAIL  test/check-official-roundtrip.test.ts · still counts what it walked, so the operator line keeps its meaning
 FAIL  test/aiops2025.test.ts · exports input.json and groundtruth.jsonl
 FAIL  test/cloudopsbench.test.ts · exports one metadata.json per case
 FAIL  test/dispatch.test.ts · answers openrca-1.0 with an export result
```

The assertion was always the same shape -- `expected 1 to be +0` -- and the child
process had **run and exited 1**, so it was not a fork failure and not a
timeout. CI reported the same failure against a different victim again:
`gen-rcaeval-cases.test.ts · --check · skips a non-directory entry at every
level`.

A varying victim is the signature of a shared resource, so each candidate was
measured rather than argued:

| hypothesis | measurement | verdict |
| --- | --- | --- |
| scratch-prefix collision | every `mkdtempSync` prefix in the suite is distinct | excluded |
| the 5 s vitest timeout | the failing tests cost **80 ms** standalone | excluded |
| the temp filesystem | 229 GB free, inodes unlimited | excluded |
| CPU contention | 6 spinners saturating every core, **8 of 8 runs green** | excluded |
| `dist` stale against `src` | `tsc --noEmit` rc=0, `git status` clean | excluded |
| `process.env` written by a test | no test in the suite writes it | excluded |
| file-level parallelism between two files | the pair run together **12 of 12 green** | excluded |

### What was actually wrong

`typecheck-entrypoint.test.ts` builds a cold worktree and tore it down with

```ts
try {
  execFileSync('git', ['worktree', 'remove', '--force', cold], { cwd: ROOT });
} catch {
  rmSync(cold, { recursive: true, force: true });
}
```

`git worktree remove` deletes the directory **and** deregisters it. When it fails
-- and it fails whenever a child still holds the tree, which is the normal state
of a suite at `afterAll` -- the handler removes the directory while leaving the
registration in `.git/worktrees/`. Measured, after a handful of runs on one
revision:

```
$ git worktree list
/…/rca-bench-factory             f1e0cd7 [master]
/tmp/rca-bench-typecheck-fqBOCy  f1e0cd7 (detached HEAD)   <- leaked

$ ls /tmp/rca-bench-typecheck-*
/tmp/rca-bench-typecheck-fqBOCy    directory present, registered
/tmp/rca-bench-typecheck-p0jVPV    directory present, NOT registered
```

Two half-states from one defect, in opposite directions: a registration with no
directory, and a directory with no registration.

The leaked registration is a **second working tree of this repository**, and the
next run's `coldCopy()` enumerates the working tree with `git ls-files --others`.
This is finding 128 recurring -- the defect class where the clean-up is the
defect -- and it is why the failure came in bursts.

### Why the burst is the evidence

Load produces a *spread*; it does not produce a *streak*. Measured over one
session:

```
run 1  green      run 6  red        run 11 green
run 2  green      run 7  red        run 12 green
run 3  green      run 8  green      run 13 green
run 4  green      run 9  green      run 14 green
run 5  red        run 10 green      run 15 green
```

and later, on the same revision with no change, **10 of 10 green**. A streak that
clears on its own is a side effect of the previous run rather than a property of
this one, and it is the one signature that points at the worktree rather than at
the machine.

### The repair

The registration is now pruned unconditionally, outside the handler, before the
directory is removed, so a failure of `worktree remove` cannot skip it:

```ts
try { execFileSync('git', ['worktree', 'remove', '--force', cold], { cwd: ROOT, stdio: 'pipe' }); }
catch { /* expected whenever a child still holds the tree */ }
try { execFileSync('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'pipe' }); }
catch { /* the directory removal below is the last resort */ }
rmSync(cold, { recursive: true, force: true });
```

Measured after the repair: **5 of 5 runs left `git worktree list` at one entry
and zero `/tmp/rca-bench-typecheck-*` directories.**

### The second half: the file was the suite's most expensive

The same file ran the identical `pnpm typecheck` **twice**, once per assertion,
against the identical worktree. Measured in-suite at **26128 ms** against
**11328 ms** standalone, it was also the reason `collect` took 130 s on a run
that failed. In-suite, `pnpm install` and two `tsc` processes ran alongside
thirty-one other workers while `check-official-roundtrip.test.ts` held roughly
300 MB of corpus, and `/sys/fs/cgroup/memory.events` recorded **max 9279** --
the cgroup at its 8 GiB ceiling 9279 times -- with `oom_kill` rising from 0 to 1
under a controlled allocation pressure applied for confirmation.

Both assertions read the same result, so the compile is now memoised and runs
once. The file went from **26128 ms to 6.28 s** in-suite, with both assertions
intact: the second one reads at 0 ms.

### The guard

`packages/core/test/heavy-fixtures-do-not-contend.test.ts` makes the properties
assertable rather than leaving them as prose. It reads the suite's own source
with comments and string literals blanked, so a fixture added tomorrow is visible
to it, and its six assertions are:

| assertion | what it prevents |
| --- | --- |
| the positive control finds the heavy fixture | a scan that has drifted and is green over an empty set |
| exactly one file runs a package manager | a second one moving the suite's whole memory ceiling |
| the package manager runs with `cwd: sandbox` | a `pnpm install` rewriting this tree's `node_modules` under 31 workers |
| the worktree registration is pruned, not only the directory | this finding |
| the compiler is invoked exactly once, and both assertions read the memo | a return to two `tsc` processes |
| the bulk corpus reaches 100 MB and its child is heap-capped | a fixture that stops being the fixture this file is about |

**10 mutations, 10 caught, 0 survived.** Two of them survived the first battery
and both were real gaps in the guard rather than in the subject: `cwd: sandbox`
was satisfied by an unrelated `git worktree` call on the same line, and
"at least two `writeBulkCorpus` calls" was still true after the 300 MB fixture
was replaced with an empty corpus. Measuring the mutation is what found both.

---

## Finding 141 — finding 140's repair did nothing, and was reported as working

**What was seen.** Finding 140 recorded a leaked `git worktree` registration in
`typecheck-entrypoint.test.ts` and a repair whose teardown pruned the
registration after attempting `git worktree remove`. It was reported fixed on the
strength of twelve green suite runs. A later run leaked again:

```
$ git worktree list
/root/…/rca-bench-factory          f1e0cd7 [master]
/tmp/rca-bench-typecheck-gshGgu    f1e0cd7 (detached HEAD)   <- leaked, directory present
$ ls .git/worktrees/
rca-bench-typecheck-gshGgu
```

**What was actually wrong.** `git worktree prune` deregisters a worktree whose
**directory is already gone**. At `afterAll` time the child processes have not
exited, so the directory is still there and `prune` declines:

```
$ git worktree prune --dry-run -v      # directory still present
(no output)
```

The teardown ordered the two steps the wrong way round:

```python
try { worktree remove --force } catch {}
try { worktree prune } catch {}          # no-op: the directory still exists
rmSync(cold, recursive)                  # deletes it *after* the prune declined
```

Deleting the directory first and pruning second is the order that holds, and the
end state was confirmed by hand before being written into the file:

```
$ rm -rf /tmp/rca-bench-typecheck-gshGgu
$ git worktree prune
$ ls .git/worktrees/
(empty)
```

**Why the first report was wrong.** The twelve green runs were real, and they were
not evidence: the leak is a *side effect of the previous run*, so a window of runs
taken immediately after a manual clean-up is the one window guaranteed to be
clean. The claim "fixed" was supported by the absence of a symptom whose
mechanism had not been checked. Reading `prune --dry-run` takes one command and
would have refuted the repair before it was written.

**The repair, and the guard on its order.** The teardown now deletes, prunes,
deletes again -- the third step because a child that outlives the first deletion
can recreate the tree between steps one and two -- and then reads
`git worktree list --porcelain` back and names any leaked path on stderr, so a
leak is a line in the suite output rather than an inference from a later burst of
unrelated failures.

`heavy-fixtures-do-not-contend.test.ts` asserts the **order** rather than the
presence of the calls, because presence was what the previous guard checked and
presence was satisfied by the broken version:

```ts
expect(deleteAt, 'the directory must be deleted before the prune, because prune
  only deregisters worktrees whose directory is already gone').toBeLessThan(pruneAt);
expect(teardown.slice(pruneAt), 'the directory must be removed again after the
  prune').toContain('rmSync(cold');
```

---

## Finding 142 — a guard that named seven batteries and was wrong about five

**What was seen.** `batteries-verify-their-restore.test.ts` was written to assert
that every mutation battery in `scripts/` verifies its restore rather than only
performing one. Its first version reported six batteries that do not:

```
scripts/injection/fault-extraction-scoring.py
scripts/injection/fault-extraction-workflow.py
scripts/injection/fetch-official-retry.py
scripts/injection/m1-ceiling-probe.py
scripts/injection/scorer-stability-probe.py
scripts/injection/type-miss-probe.py
```

**What was actually wrong.** Two separate defects, and the guard's was the
larger one. The guard matched a *name* against the spellings
`assert_source_restored|assertRestored|assert_source_intact|verifyRestore`. Three
of the six it named compute a verdict under a different name
(`restore_recorded()`, `restored`) and return
`0 if caught == len(INJECTIONS) and restored else 1` -- which is an assertion, and
a stronger one than a printed line. The guard was reading a name where the
property is a data flow, which is the third time this repository has written a
scanner that cannot tell one thing from another (findings 127, 133, and the
`cwd: sandbox` substring in finding 140).

Three batteries genuinely do not act on their restore verdict, and one of them
had no verdict at all:

| battery | restore | verdict printed | reaches the exit status |
|---|---|---|---|
| `fault-extraction-scoring.py` | `shutil.copy(PRISTINE, SRC)` | yes | **no** -- `return 1`/`return 0` from `uncaught` only |
| `fetch-official-retry.py` | `shutil.copy(PRISTINE, SRC)` | yes | **no** -- same shape |
| `fault-extraction-workflow.py` | `write_atomically(WORKFLOW, pristine)` | negative control only | **no** -- `return 1`/`return 0` from `uncaught` only |

`gate-tests-battery.py` had already named this in its own docstring: *"The other
batteries in this repository print this check; this one asserts it."* The
sentence was true, was written down, and nothing read it.

**The repair.** All three now compute a restore verdict by comparing the subject
against its capture, return a nonzero status when it differs, and gate the
negative control on the same return. Proven rather than read: each assertion
function was extracted and run against a restored and a corrupted pair in
isolation, giving `0` and `2` respectively, and the three batteries were re-run
end to end with all injections still caught.

**The guard was rewritten to measure the property, and then the guard itself was
mutated.** Four formulations of the detector were wrong before the fifth held.
Each was caught by running a mutation battery against the guard, not by reading
it:

| reading | what defeated it |
|---|---|
| `return\b[^\n]*(?:\n\s+[^\n]*)*` | greedy -- one match spanned from a `return` into an unrelated function |
| name match on `assert_*` | three false positives, above |
| bracket-joining into statements | counted brackets **inside string literals**, collapsing a 200-line file into 19 "statements" |
| "contains a comparison **and** a restore-ish word" | matched a `print` message I had myself added that morning |
| "comparison with restore operands, within 5 lines of a nonzero return" | rejected the *unmutated* file and accepted the mutated one |

The final reading: a restore verdict must be **produced by a comparison over
restored content**, and that verdict must appear in a statement that returns a
nonzero status. Six mutations were run against it and **6/6 were caught**,
including two that disable the guard itself.

**One mutation it still cannot see, recorded rather than papered over.** Replacing
`if current != pristine:` with `if False:` inside
`assert_workflow_restored()` survives, because that function retains a second,
unrelated comparison (`status == 0`) that a text reading cannot distinguish from
the check. The direction of the residual gap is the safe one -- the rule cannot
report an *unasserted* battery as asserted -- and the limitation is written into
the test that carries it.

## Finding 143 — the intermittent run is two different faults, and neither is the suite

Two captured full-suite runs of `packages/core` failed, and they failed
*differently*. Separating them was the first thing this investigation did,
because every earlier attempt had treated "the suite is flaky" as one property
and no single explanation fits both.

| log | exit | `FAIL` lines | coverage ENOENT | `Tests` line |
| --- | --- | --- | --- | --- |
| `/tmp/cap-1.log` | nonzero | **0** | **2** | absent |
| `/tmp/cap-2.log` | nonzero | **4** | 0 | `4 failed \| 3276 passed (3280)` |

A run that exits nonzero with **no failing test and no summary line** is not a
test failure. Nothing in the suite ran incorrectly; the process died while
reporting. A run with four `FAIL` lines is the ordinary kind. These need
different repairs, and the record below keeps them apart.

### The four genuine failures are not four defects

`cap-2`'s failures were, in the order the reporter listed them:

```
 FAIL  test/gen-examples.test.ts > ... passes --check against the file it has just written
 FAIL  test/gen-rcaeval-cases.test.ts > ... classifies each case into its suite
 FAIL  test/ingest-report.test.ts > ... ingests a file with more rows than can be spread into a call
 FAIL  test/ingest-report.test.ts > ... keeps every row when several files each exceed the limit
```

Four different files, and each one passes in isolation. Run alone:

| file | tests | wall |
| --- | --- | --- |
| `gen-examples.test.ts` | 14 passed | 4.69 s |
| `gen-rcaeval-cases.test.ts` | 21 passed | 4.03 s |
| `ingest-report.test.ts` | 15 passed | 14.69 s |

Measured per test, the two `ingest-report` entries are the whole cost of that
file -- 2491 ms and **8706 ms** against a `ROWS_TIMEOUT_MS` of 30 000. They sit
inside the argument-limit describe block, whose docstring records why the size
is what it is: `ROWS = 130_000` is deliberately past the probed V8 spread
ceiling (between 100 000 and 125 000), and the comment already says the timeout
is raised because "building and parsing a payload of that size is the work under
test, not slow setup".

So the budget is correct by design and the *headroom* is the finding. 8706 ms
measured alone is 29% of a 30 000 ms budget; under a full suite the same test is
competing with 122 other files for a container whose cgroup grants **4 CPUs**
while `nproc` advertises 32. A 3.4× margin is not a margin that survives that,
and the observed failure is exactly the shape it would produce -- and it lands on
a *different* set of files each time, which is why four victims looked like four
defects and were one condition.

### The other mode is a race inside vitest's coverage reporter

`cap-1` exited nonzero with `FAIL=0` and this, twice:

```
Unhandled Rejection
Error: ENOENT: no such file or directory, open '.../packages/core/coverage/.tmp/coverage-11.json'
 ❯ Object.writeFile ../../node:internal/fs/promises:1212:14
```

The mechanism is readable in the installed provider, and it was confirmed by
running the two candidate orders rather than by argument. `BaseCoverageProvider`
accumulates a `pendingPromises` array of `writeFile` calls, one per suite, and
`readCoverageFiles()` drains it exactly once:

```js
async readCoverageFiles({ onFileRead, onFinished, onDebug }) {
  const total = this.pendingPromises.length;
  await Promise.all(this.pendingPromises);   // the only drain
  this.pendingPromises = [];                 // and the reset
```

Anything pushed after that drain is never read, and its rejection has no owner --
which is precisely an `Unhandled Rejection` that sets the process exit code with
no test having failed. The probe that settles it runs both orders against a real
temp directory:

```
order1 (all writes awaited before the drain): 20 of 20 files landed
order2 (a write pushed after the drain):       1 of 2 landed, and the second
                                               raised ENOENT at
                                               node:internal/fs/promises:1212
```

The second `ENOENT` is the same line number as the one in `cap-1`. The write
site is the worker's own completion hook, which pushes its coverage through the
RPC bridge after the file's tests finish:

```js
testRunner.onAfterRunFiles = async (files) => {
  const coverage = await takeCoverageInsideWorker(config.coverage, executor);
  if (coverage) rpc().onAfterSuiteRun({ coverage, ... });
```

**This defect is in vitest's coverage reporter, not in this repository**, so the
only honest options are to remove the trigger or to report the race when it
happens. Editing `pendingPromises` is not available to us, and a `--no-coverage`
CI path would not be a repair -- it would delete the coverage gate that the rest
of this campaign exists to enforce.

### What was falsified along the way

Two explanations were recorded as candidates before they were measured, and both
are now dead. They are kept here because each was plausible and each would have
produced a change to this repository for no reason:

**Memory.** `maxWorkers: 8` was added to `packages/core/vitest.config.ts` on the
theory that the default of 32 overruns the container's 8 GiB. The full table is
in that file's own comment and it does not support the theory: `memory.events
max` delta was **0** at 4 workers, **0** at 8, and **0** at the default 32 -- and
the default run was *green*, 3280 passed. `oom_kill` was 0 throughout. The cap is
retained as headroom, and both the comment and this entry say so rather than
upgrading it into a repair it is not.

**A leaked child process.** Four test files use an asynchronous `spawn`
(`fault-extraction-scripts`, `fetch-official`, `gate-test-battery-exclusion`,
`timeout-budget`), and a worker that outlives its file would plausibly push
coverage after the drain. Running each file alone and counting vitest processes
afterwards gives `before=1 after=1` for all four, and every `node` process on the
box has an `etimes` equal to the container's own age -- none of them is from a
test run. No leak.

### Environment

`nproc` reports **32**; `cpu.max` is `400000 100000`, i.e. **4 CPUs** of quota;
`cpu.stat` shows `nr_throttled 4885` in `nr_periods 20181`, so the cgroup was
throttled in roughly a quarter of all periods. Every "it is slower in the suite"
observation in this entry is downstream of that number, and it is also the
condition under which a worker's coverage RPC is most likely to arrive late.

## Finding 144 — a syntax check that asserted the process had started, not that it succeeded

`fault-extraction-scripts.test.ts` ended with a five-line describe block whose
title is a claim and whose body does not test it:

```ts
it('is valid JavaScript that Node accepts', () => {
  for (const script of [DERIVE, SCORE]) {
    const result = spawn(process.execPath, ['--check', script], { cwd: ROOT });
    expect(result.pid).toBeGreaterThan(0);
  }
});
```

Two independent faults sit in that line, and they compound.

**The child is never joined.** `spawn` is asynchronous; nothing awaits the
child, so the test body completes while node is still loading. The comment above
it -- "cheap, and it catches the class of edit that leaves a stray `fi` or an
unbalanced quote" -- describes work that has not happened at the time the
assertion runs.

**`pid > 0` is true of a process that fails.** Every successfully *started*
process has a pid, including one that exits 1 because the file it was told to
check does not parse. `node --check` on a file with an unbalanced quote prints a
syntax error to stderr, exits 1, and still hands the parent a pid. So the
assertion is satisfied by exactly the input the test exists to reject: a script
with a syntax error would pass, and the title would still read "is valid
JavaScript that Node accepts".

That is this campaign's recurring shape -- something that reports success while
doing nothing -- in its purest form so far, because the *title* is the claim and
the assertion measures a different, always-true property. Eight earlier findings
were clauses nobody read; this one is an assertion nobody could fail.

### How it was found

Not by reading it. It was found by the guard added in this same iteration,
`coverage-writes-are-drained.test.ts`, whose repository-side rule asks which test
files start an asynchronous child and never join it. That rule exists for a
different reason -- a child that outlives its file can push coverage into the
reporter after the write array has been drained, which is mode (a) of Finding
143 -- and it named exactly one file. Reading that file to confirm the finding is
what exposed the assertion defect underneath it, which is the more serious half.

The ordering of those two discoveries is the lesson worth keeping: the guard was
written about scheduling, and it found a correctness defect, because an unjoined
child and an unasserted result have the same cause -- a `spawn` call written as
though it were `spawnSync`.

### The repair

`spawnSync` (already imported in the file), an assertion on `status`, and a
control that proves the assertion can fail:

```ts
it('is valid JavaScript that Node accepts', () => {
  for (const script of [DERIVE, SCORE]) {
    const result = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8', cwd: ROOT });
    expect(result.status, `${script} is not valid JavaScript:\n${result.stderr ?? ''}`).toBe(0);
  }
});

it('and the check above can fail, so a green run means the files were read', () => {
  const broken = join(TMP, 'broken.mjs');
  writeFileSync(broken, 'export const x = ;\n');
  const result = spawnSync(process.execPath, ['--check', broken], { encoding: 'utf8', cwd: ROOT });
  expect(result.status, 'node --check accepted a file with a syntax error').not.toBe(0);
});
```

The control is not decoration. Without it, a misspelled flag, or a node that
ignored `--check`, would leave the first loop passing over files it never
examined -- the same false-green one level up, which is how the first version
came to exist. The failure message now carries the child's stderr, so a red run
names the offending line instead of just the exit status.

### Why removing the asynchronous `spawn` does not weaken the site proof

`gate-sites-are-proven.test.ts` rule 7 infers a test file's script coverage from
`spawnSync`/`execFileSync`/`execSync` calls only -- asynchronous `spawn` is not
part of the inference. The proof for these two scripts was always carried by the
`execFileSync` calls inside the file's `run()` helper. Removing the `spawn` call
therefore changes nothing the inventory reads, which was verified by running rule
7 after the edit rather than assumed from reading it.

### Mutation evidence

The new guard was shown to be load-bearing rather than self-agreeing, by breaking
each property it claims and confirming it goes red:

| mutation | guard's verdict |
| --- | --- |
| `readCoverageFiles`: reset placed before the drain | **red** -- names the ordering assertion |
| a test file added that spawns and never joins | **red** -- names the file |

The first attempt at the ordering mutation silently did not apply: the script
matched the two statements by a hard-coded three-tab indent and the file uses
two, so nothing was written and the guard reported green. That green would have
been read as "the ordering assertion is vacuous". The mutation was rewritten to
locate the statements by regex and to print the text it replaced, and it then
went red as expected. A mutation harness that can no-op is the same class of
defect as the test it is validating, and it is recorded here for that reason.

## Finding 145 — the user-guide gate was rebuilding the repository under test

The intermittent failure catalogued in Finding 143 as mode (b) is not a flaky
test, not a timeout budget, and not memory pressure. It is one test that rebuilds
the packages the rest of the suite is reading, and its cause is a documentation
gate executing a command with a side effect in the tree under test.

### The measurement that found it

Three facts, each cheap and each necessary:

1. **`dist` is rewritten once per suite run and never while idle.** Sampling the
   mtime of `packages/core/dist/index.js` and `packages/cli/dist/main.js` every
   400 ms showed a rewrite at the start of every full-suite run and *no* change
   over a 90-second idle window. The suite causes it; nothing else does.

2. **The rewriter is `tsc` under `pnpm build`.** Polling the process table
   throughout a run caught:

   ```
   pnpm official:check
    └ sh -c pnpm build
       └ sh -c pnpm --filter @rca-bench-factory/core build && pnpm --filter @rca-bench-factory/cli build
          └ node .../typescript/bin/tsc -p tsconfig.json
   ```

   Both packages' outputs, in the working tree, mid-run.

3. **Its parent is the user-guide gate.** `/proc/<pid>/status` walked up from that
   process gives the chain that names the culprit exactly:

   ```
   pnpm official:check
    └ bash /tmp/rca-bench-guide-BV1fSZ/steps.sh
       └ node scripts/check-user-guide.mjs
          └ node (vitest 5)
   ```

`docs/user-guide.md` documents `pnpm official:check`, and the root manifest gives
it a hook:

```json
"preofficial:check": "pnpm build"
```

`check-user-guide.mjs` runs the document's `bash` blocks verbatim with
`cwd: ROOT`, so executing the guide ran a full build of both packages **inside
the repository, in the middle of the suite that was reading it**.

### Why that produced a test failure

About a hundred test files read `packages/core/dist/index.js` or spawn
`packages/cli/dist/main.js`, and a `tsc` build is not atomic across the files it
emits. A concurrent importer could therefore read `dist/index.js` after it was
rewritten but before the module it re-exports from was. The captured failure is
precisely that torn state:

```
SyntaxError: The requested module './fault/category-derivation.js' does not
provide an export named 'ALT_READING_FLOOR'
```

surfacing as `expected 1 to be +0` from whichever file happened to spawn a reader
at that instant -- and a *different* file each time. That is why four separate
victims looked like four defects: two were CPU-starvation timeouts in
`ingest-report.test.ts`, and two were this torn import.

The same mechanism explains the two other observations that had been recorded
without explanation: the failure landing on a different file each run, and the
whole suite's wall time being dominated by contention. Two concurrent `tsc` runs
plus 8 vitest workers on a cgroup with a **4-CPU** quota is where the throttling
in Finding 143's environment section comes from.

### The repair

The hook is a *precondition* of the script, not the thing the script asserts, and
the guide's step is about what a reader types -- which is still executed exactly
as written. So the gate suppresses `pre`/`post` hooks for the duration of the
walkthrough:

```js
env: { ...process.env, npm_config_enable_pre_post_scripts: 'false' },
```

Verified by experiment rather than by reading pnpm's documentation:

| run | `packages/core/dist/index.js` |
| --- | --- |
| `pnpm official:check` | rewritten |
| `pnpm official:check` with the variable set | **untouched**, exit 0, no build emitted |

What is given up is only the *side effect* of re-running a build in a tree that is
already built and is being read by other tests. The precondition keeps its own
proof in two places that do not share this hazard: `cold-tree-preconditions.test.ts`
holds the declaration (`pre<script>` exists and names a build), and the
`cold-tree` CI job exercises the behaviour on a machine that has never been built.
This is the same division of labour the repository already uses for
`pretypecheck`.

### The guard, and its mutation

`check-user-guide.test.ts` now records the build outputs' mtimes before the live
run and asserts they are unmoved afterwards, and it asserts the hazard still
exists from both sides so it cannot pass on a document that no longer has one:
the guide must still contain `pnpm official:check`, and the manifest must still
give that script a build hook. If either disappears, the test fails and says to
re-derive it rather than to delete it -- an assertion whose subject has vanished
is the failure mode this campaign keeps recording.

Removing the one-line repair and re-running the guard produced exactly one red
test, naming itself:

```
FAIL  test/check-user-guide.test.ts > ... > does not rebuild the packages it is
reading the guide against
```

and restoring it returned the file to 12 passed. The guard is load-bearing.

### A side effect worth recording

The same file's standalone cost fell from **5517 ms** (the figure in
`timeout-budget.test.ts`'s measured table) to **1282 ms**, because the build the
gate used to trigger is gone. Every measurement in that table was taken in a tree
where this gate ran, so the numbers below the ones for `check-user-guide` may be
conservatively high for the same reason. The table is left as measured rather
than silently adjusted; what changed is the machine's work, and that is recorded
here.

### What this does not establish

It does not establish that the suite is now deterministic. It establishes that
one measured cause of one measured failure mode is removed, and it leaves a test
that fails if that cause returns. The coverage temp-file race of Finding 143's
mode (a) is a separate defect in vitest's reporter and is unaffected by this
change.

### Acceptance record for findings 143-145

Taken on the tree this entry was committed from, after every repair above.

**Twelve consecutive full-suite runs, all green:**

```
run  1..12   rc=0   FAIL=0   coverage-ENOENT=0   Tests 3285 passed (3285)
```

Twelve clean runs is the bar this investigation set for itself, because the
defects it was chasing were *intermittent* and a single green run is what the
previous four attempts at this had mistaken for a repair. Before the repairs the
same window produced 2 failures in 12, both of them the torn-`dist` import of
Finding 145 or the `ingest-report` timeout that Finding 145's load explains; the
coverage-ENOENT race of Finding 143's mode (a) did not appear in any of the last
24 runs, which is recorded as *not observed* rather than as fixed -- it is a
defect in vitest's reporter and nothing in this repository changed it.

**Coverage, per dimension:**

| metric | value | threshold |
| --- | --- | --- |
| statements | **99.96%** | 95% |
| branches | **99.91%** | 95% |
| functions | **100%** | 100% |
| lines | **99.96%** | 95% |

**Every gate:**

| gate | result |
| --- | --- |
| `pnpm lint` (7 checks) | rc=0, `ALL PROPERTIES HOLD` |
| `pnpm typecheck` | rc=0 |
| `pnpm docs:check:cold` (4 checks) | rc=0 |
| `pnpm docs:counts:check` | rc=0 |
| `pnpm examples:check` | rc=0 |
| `pnpm examples:bundle:check` | rc=0 |
| `pnpm official:check` | rc=0 |

**Counts, retaken after the new guard files were added:**

| scope | files | tests |
| --- | --- | --- |
| core | 124 | 3285 |
| cli | 3 | 173 |
| repo | 127 | 3458 |

The retake is worth recording as its own small lesson. Regenerating
`golden-master/doc-counts.json` immediately made the numbers *published* in
`docs/progress.md` stale, and `check-doc-counts.test.ts` failed with the exact
lines named -- `line 3681: declares the current state of 'core' as 121 files /
3269 tests, but the suite has 124 / 3285`. The four `as of this commit` rows were
corrected; the dated `Pass 39` rows beside them were deliberately left alone,
because a row that records a past run is a record and not a claim. A gate that
names the line is what made that distinction cheap to keep.

### The fix confirms against CI, not only against this sandbox

The commit before this one had a red CI run, and the failing step is the one this
work was about:

```
job  typecheck / lint / test / coverage / mutation / golden-master / build  -> failure
step `Test with coverage (core + cli, >=95% per dimension, 100% functions)` -> failure
```

Its log carries the signature of mode (b), from the same file the sandbox found:

```
 FAIL  test/gen-rcaeval-cases.test.ts > scripts/gen-rcaeval-cases.mjs · --check > skips a non-directory entry ...
AssertionError: expected 1 to be +0 // Object.is equality
##[error]AssertionError: expected 1 to be +0 // Object.is equality
```

`gen-rcaeval-cases.mjs` imports `../packages/core/dist/index.js`, which is exactly
the module the guide gate was rebuilding underneath it. So the defect was not an
artefact of this sandbox's load: it reproduced on a CI runner, on the same file,
with the same assertion, and the diagnosis -- a torn `dist` read rather than a
broken generator -- is the only one that covers both.

After this commit, that step and the cold-tree job are both green:

```
Anchor round trip  ->  success
CI                 ->  success
  cold tree / no build / every precondition declared                     success
  typecheck / lint / test / coverage / mutation / golden-master / build  success
```

This is recorded because it is the difference between "the suite passes here now"
and "the cause was identified". A local green run after an intermittent failure is
what the four earlier attempts at this had, and it was wrong each time.

## Finding 146 — the gate read the workflow lines that were easiest to read, and reported OK about the rest

`check-no-unsafe-shell.mjs` states its own scope in a comment beside the scan
roots:

> `.sh` files are scanned in full. The workflow files are scanned because `run:`
> bodies are shell, and a `run: node -e "..."` is exactly the defect.

Only the first half of that was true. A `run:` value written as a **block scalar**
was skipped outright:

```js
const body = m[1];
// A block scalar's first line is usually empty; the body follows.
if (body === '' || body === '|' || body === '>' || body === '|-' || body === '>-') return;
```

The comment says "the body follows" -- and then the body is not read. Measured on
the shipped tree, **20 of the 58 `run:` bodies in `.github/workflows/` are block
scalars**, so the shape that was skipped is the shape most steps use.

The two forms of one command, side by side:

| written as | verdict before the fix |
| --- | --- |
| `run: node -e "console.log(${x})"` | **caught** -- `nested-interpreter-expansion` |
| `run: \|` then `node -e "console.log(${x})"` on the next line | **`OK`, rc=0** |

Same command, same defect, different YAML spelling, opposite verdicts. This is the
campaign's recurring shape again -- a published claim and no reader for the case
that matters -- and it is the second time this file has been the site of it.

### The fix exposed a second defect in the rule itself

Scanning the bodies immediately turned the repository's own workflows red, on one
line:

```
.github/workflows/fault-extraction-accuracy.yml:295:30
miss_row_count=$(printf '%s' "$missed_rows" | grep -c . || true)
```

That line is not a defect. `grep -c .` counts lines; nothing is being interpreted,
and `$missed_rows` is an ordinary expansion the author intended.

The rule had been firing on the **flag** rather than on the program:

```js
const NESTED_INTERPRETERS = new Set(['-e', '-c', '--eval', '--expr']);
const namesInterpreter = toks.some((t) => NESTED_INTERPRETERS.has(t));
```

`-c` is also `grep -c`, `cut -c`, `sort -c` and `tr -c`. None of those interprets
a string, and every one of them was reported as though it did. The rule was wrong
about its subject for the whole family, and nothing had ever said so because the
one line in this tree where it fires sits inside a `run: |` body -- the shape the
gate was not reading.

So the rule now requires both halves: a program that interprets a string, and the
flag that tells it to. Names are compared by basename after removing a version
suffix, so `/usr/bin/node`, `python3` and `php8.2` are recognised.

### What was added, and what holds it

Six tests, written before the implementation:

| test | before | after |
| --- | --- | --- |
| a block-scalar body carrying the defect is caught, and the line named is the body's line, not the `run:` line | **red** | green |
| `run: >` and `run: |-` are read too, so the fix is not `|`-shaped | **red** | green |
| a block body whose only `$` is `${{ }}` passes | green | green |
| an empty block body does not fall off the end of the file | green | green |
| the repository's own workflows still pass, so the body scan invents nothing | green | green |
| `grep -c` / `cut -c` / `sort -c` pass, and `node -e` / `python3 -c` / `/usr/bin/node --eval` still fail | **red** | green |

The three that were green before are the controls, and they are the reason this is
a finding rather than a rewrite: a body scan that reported any of them would be a
false positive on real input.

Mutation evidence, both halves removed in turn:

| mutation | result |
| --- | --- |
| block bodies not scanned again | **red**, 2 tests, both block-scalar ones, named |
| eval flag alone is enough again | **red**, 5 tests, including the shipped-tree control |

Restoring the file returned the suite to **47 passed**.

### What this does not establish

It does not establish that every workflow command in this repository is safe. It
establishes that the bodies are now read by the rule the gate already had, and
that a body carrying that defect is caught. The rule's subject is one class --
`$`-constructs a shell expands before the program it names starts -- and a body
that is unsafe in some other way is outside it, as it always was for `.sh` files.

## Finding 147 — the mutation battery's own count was wrong on CI, and its basis said otherwise

`docs/progress.md` carried one open question about the gate-test battery:

> **It does not explain the 24 CI SURVIVED.** ... That question remains open, and
> it is now this gate's only open question.

### The question is answered, from the artifact rather than from a re-run

CI uploads the battery report (`ci.yml`), so the answer is a download. The report
from the run at `f6f7522a` -- the commit that carries findings 143 to 146:

```
caught: 24   survived: 0   inert: 0   timed_out: 0   redundant: 1
restore_status: 0   total_seconds: 110.2
diagnosis histogram: {'tests_failed': 24, 'no_tests_collected': 1}
```

Twenty-four caught, zero survived, and every caught row carries
`diagnosis: tests_failed` -- that is, the runner itself reported failing tests.
The `0 caught / 24 survived` reading no longer reproduces, and the field added by
the previous round is what makes the claim checkable rather than asserted.

### But reading that report closely found a live defect in it

The one row that is not CAUGHT is the legitimate REDUNDANT, and its fields
disagree with its own evidence:

```
name:             RCAEVAL 2. a non-directory entry at the top level is treated as a suite
verdict:          REDUNDANT
tests_run:        0
tests_run_basis:  summary
output_tail:      ...
                  '\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m21 passed\x1b[39m\x1b[90m (21)\x1b[39m'
```

The row says the runner ran **0** tests, in the basis that means "from the
runner's own tally", while the output it ships alongside says **21 passed**.

### The cause

`strip_ansi` exists in that script and is applied by three of its four parsers:

| function | strips? |
| --- | --- |
| `failing_tests` | yes, via a local `plain = strip_ansi(output)` |
| `failed_count` | yes, same |
| `collected_basis` | yes, inline: `re.search(..., strip_ansi(output))` |
| **`collected_count`** | **no** |

On CI vitest colourises, because the runner's stdout is not a terminal. Every
escape therefore sits exactly where the pattern needs whitespace:

```
Tests  21 passed (21)                                  a terminal
Tests \x1b[22m \x1b[1m\x1b[32m21 passed\x1b[39m...      CI
```

`Tests\s+(\d+) passed` matches the first and not the second. So the summary parse
fails, `collected_count` falls through to its frame-counting fallback -- and a run
with no failing frames returns **0**.

That fallback is itself the repair for an earlier finding, and it is why the
verdicts are right today: `failed_count` > 0 comes from the frames, so every
injection that failed is still CAUGHT. The count is the part that was never
exercised on CI, because the case that exposes it -- a row where nothing failed --
is the one row the battery expects to be REDUNDANT.

### Why this is the same defect as the one it was found next to

`tests_run_basis` was added so that a count could not be misread: `summary` means
an exact total, `failures` means a floor. On CI the basis strips and the count does
not, so the field reports `summary` while the number came from the frames. **The
mechanism built to make a number legible made it legible and still wrong** -- which
is the shape this campaign keeps recording: a claim and its reader disagreeing,
with the reader unable to tell.

### The repair, and what holds it

One line, at the top of `collected_count`:

```python
output = strip_ansi(output)
```

A test was written first, from **real captured bytes** rather than a paraphrase.
The fixture already held CI-shaped output, but only tails too short to include a
summary, so a third shape was added carrying the ANSI-wrapped green summary of the
very row above, extracted from the run's artifact. Against the unfixed script it
fails with the defect's own number:

```
AssertionError: the count must be the number the summary states: expected +0 to be 21
```

Removing the one line again returns exactly that failure and nothing else;
restoring it returns the file to 11 passed. The three battery test files together
are 31 passed.

### What this does not establish

It does not establish that the parser handles every shape CI can emit. It
establishes that the one shape a green run produces is parsed correctly, which is
the case that had no test and the case the report was wrong about. The general
lesson -- apply the normaliser at every parse boundary or none -- is stated here
and not enforced by anything; a fifth parser added later could repeat it.

---

## Finding 148 — four readers of one summary line, and three batteries nothing invoked

**What was seen.** Reading the CI artefact to close finding 147's open question
left one row whose parenthetical could not be trusted, and following it out led
to a second, larger defect underneath it.

`scripts/inject-stability.mjs` runs in CI, as the step named "Scorer stability
battery". On CI at `f6f7522a` it printed:

```
CAUGHT  A. non-deterministic: embed a per-call counter in the report  (failed 1, passed 0)
CAUGHT  B. mutates its input: sorts the samples in place             (failed 1, passed 0)
CAUGHT  C. pairs by position instead of by id                        (failed 1, passed 0)
CAUGHT  D. drops the denominator: omits a sample that missed         (failed 1, passed 0)
```

Four mutations that break four different properties, and all four reporting the
same pair. Run on this machine, the same battery at the same commit printed:

```
(failed 2, passed 14) / (failed 2, passed 14) / (failed 1, passed 15) / (failed 1, passed 0)
```

`(1, 0)` is the catch arm's default for a summary it could not read, and the
agreeing-everywhere shape is what gave it away.

**The root cause is finding 147's, one file over.** CI leaves colour on although
the child's stdout is a pipe, so the summary arrives as

```
\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m21 passed\x1b[39m\x1b[22m\x1b[90m (21)\x1b[39m
```

`Tests\s+` walks into `\x1b[22m` where a terminal would have whitespace. Both arms
of `runSuite` searched the raw text, both failed, and both fell through to their
defaults -- so the number printed beside every verdict was a constant.

**The verdicts were still right**, and that is worth stating rather than
celebrating: the catch arm's default is `failed: 1` and the success arm's is
`failed: 0`, which coincide with what the exit status already said. Nothing was
mis-verdict. What was wrong is the evidence. A number that reads as a measurement
and was never measured is the same defect finding 147 repaired in
`collected_count`, and the audit's standard for it is already written down.

### Two more readers, and their failure is worse than a wrong number

The same summary format is read in four places. Two of them did not use a regex
at all:

```python
for line in out.splitlines():
    stripped = line.strip()
    if stripped.startswith("Tests ") and "failed" in stripped:
        failed = int(stripped.split()[1])
```

Against a CI line, `stripped` begins with `\x1b[2m`, so `startswith("Tests ")` is
**false**, the branch is never entered, and `failed` stays 0 -- which is those
batteries' `SURVIVED` condition. Driven with the captured CI bytes, the shipped
loop returns `0` for a summary that says `3 failed`:

```
CI form   : failed = 0      -> verdict MISSED
terminal  : failed = 2      -> verdict CAUGHT
```

So on CI these two would have reported **every injection as a hole in their own
suite**, which is the battery blaming its subject for its own reader. They are
`fault-extraction-scoring.py` (12 injections) and `fetch-official-retry.py` (5).

### The reason nobody had noticed: nothing ran them

| battery | in `package.json` | in a workflow |
| --- | --- | --- |
| `inject-stability.mjs` | yes | yes |
| `inject-component-rule.mjs` | yes | yes |
| `inject-m1-ceiling-tests.mjs` | yes | yes |
| `gate-tests-battery.py` | yes | yes |
| `m1-ceiling-probe.py` | yes | yes |
| `scorer-stability-probe.py` | yes | yes |
| `type-miss-probe.py` | yes | yes |
| `fault-extraction-scoring.py` | **no** | **no** |
| `fault-extraction-workflow.py` | **no** | **no** |
| `fetch-official-retry.py` | **no** | **no** |

Seven of ten batteries are named in both places. The three that are named in
neither are **exactly the three finding 142 repaired** -- each now returns a
non-zero status when its own mutation is left behind, and that repair could only
be verified by someone typing the path by hand. It is also why
`batteries-verify-their-restore.test.ts` had to read them statically, and why that
file records a blind spot for one of them: a guard that cannot run its subject can
only describe it.

This is finding 131's `--stdin` at a scale of three, and finding 83's
`verify-scorer-stability.mjs` before it: written, documented, given a script,
never reached.

### The repair

**The parse.** All four readers now strip the escapes first, and all four
distinguish *a reading of zero* from *no reading at all*. The distinction is not
cosmetic:

- `inject-stability.mjs` prints `(no summary in its output; verdict taken from
  the exit status)` instead of a fabricated pair. Running it here shows the
  sentence is not hypothetical -- injection D produces no summary even on this
  machine, so its `(failed 1, passed 0)` was always a default.
- `fault-extraction-workflow.py` returned `(-1, -1)` on a miss, which printed
  `MISSED` and a negative control reading "**-1 test(s) failing**". It now returns
  `None` and the table prints `NO SUMMARY`, with the control saying the suite
  printed no summary.
- The two line-scanners return `None` on silence and the loop prints `NO SUMMARY`
  rather than `SURVIVED`.

`inject-stability.mjs` also had to stop being un-runnable-while-imported: its
parse is now `readSummary`, exported, with the battery's side effects moved into
`main()` behind a direct-call guard. A regex that only ever runs inside `execSync`
cannot be held against the bytes CI emits; a battery that fires on import cannot
be measured from a test.

**The wiring.** All three orphans now have a `package.json` script and a `run:`
step in `ci.yml`. Before wiring them the three were re-run end to end here, and
all three are green: 12/12, 5/5, and 9/9 with the negative control OK.

### The tests, and the mutations

`battery-summary-survives-ci-output.test.ts` feeds the **real captured bytes** --
escapes intact, from CI's own artefact -- through the Node parse, and through
three Python helpers lifted out of the shipped files and executed rather than
pattern-matched. A TypeScript reimplementation of a Python regex would pass while
the shipped regex was wrong, which is the failure the file is about.

One assertion is cross-file on purpose: the same captured text goes through every
reader and all of them must return 21. Each reader compared only with itself is
exactly how four of them came to disagree.

The failing form is composed, and the file says so: the escape sequences are the
captured ones and are asserted to be, while the count is substituted, because no
*failing* summary was captured on CI. A second all-passing capture would have
added observations without adding discriminating power, so the fixture keeps one
shape per role.

`batteries-reach-an-invoker.test.ts` asserts the wiring from the directory rather
than from a list: every `scripts/inject-*.mjs` and every `scripts/injection/*.py`
must appear in a `package.json` script **and** in a `run:` command in a workflow.
It has no exemptions -- the seven that satisfied both already did, and the three
that did not were wired rather than excused. Its matcher is controlled: a path
named only in a workflow comment must not count as an invocation, which is how the
three could otherwise have been "fixed" by writing their names into `ci.yml`
prose.

Nine mutations were applied in turn, and all nine were caught:

| mutation | result |
| --- | --- |
| bypass the stripper in `readSummary` | red, naming the Node assertion |
| bypass the stripper in `parse_summary` | red, naming the Python assertion |
| `describeOutcome` prints the pair regardless | red, naming the honest-print assertion |
| bypass the stripper in `fault-extraction-scoring.py` | red |
| silence read as 0 in `fault-extraction-scoring.py` | red |
| bypass the stripper in `fetch-official-retry.py` | red |
| silence read as 0 in `fetch-official-retry.py` | red |
| unwire a battery from the workflow | red, naming the battery |
| drop a battery's package script | red, naming the battery |

### One of my own probes was wrong, and nearly produced a finding

While measuring the two line-scanners I wrote a probe that reproduced their loop
but called `int(stripped.split()[1])` **unconditionally**, without their
`startswith` guard. It raised `ValueError: invalid literal for int() with base 10:
'Tests'`, and I was one step from recording "these batteries crash on CI, before
their restore runs, leaving a tracked source mutated".

The shipped loop does not raise. Its condition is false on ANSI text, so it skips
the line and returns a wrong number instead -- a quieter failure, and a different
repair. Redone faithfully, the reproduction is `failed = 0` for the CI form
against `failed = 2` for the terminal form. Recorded because "a probe with the
guard removed" is the same class of error as a gate that reads a mention instead
of a call, and because the first version of the conclusion would have been
dramatic, actionable, and false.

### Acceptance

Full suite **3306 passed / 0 failed** across 126 files; coverage
**99.96 / 99.91 / 100 / 99.96**; nine of nine mutations caught; the three wired
batteries green end to end; `py_compile` clean on all three.

---

## Finding 149 — the push that does not finish, and why every "no output" report was true

**What was seen.** Four times in this campaign the operator reported that a turn
ended with no output, and each time the answer given was about presentation. It
was not. The work was being done; the **result was not reaching the remote**, and
the reason was the push itself.

**The measurement.** `push_commit.py` uploads every tracked blob in the revision.
This repository has 293-295 of them, and the run takes about **twelve minutes**.
Two facts compose into the failure:

- a single foreground command is capped at ten minutes, so the push cannot be run
  to completion in the foreground;
- background work does not survive the end of a turn, so a push started in the
  background is **killed** the moment the turn ends.

Measured directly: the push launched for `5ed9567` reported "still running" at
every check across several minutes, and when the process table was read again
there was **no `push_commit.py` process at all** and the remote ref was still the
previous commit. The earlier check had been satisfied by `pgrep` matching *its own
command line*, which is the same class of error as a guard whose subject is a
substring of the file.

So the sequence that produced all four reports was: commit succeeds, push is
launched, the turn ends, the push is killed, nothing is printed -- and the remote
never moved. A push that is killed mid-way and a push that succeeded are
indistinguishable unless the remote ref is read, and reading it is what finally
settled it.

**The repair, and why it is a repair rather than a workaround.** The full upload is
redundant. The remote already holds a tree containing every file the previous push
sent, and the API deduplicates by content hash, so only the blobs whose SHA
differs need to be created and the new tree can be expressed as *the remote tree
plus the differences* (`base_tree`). `push_incremental.py` does that:

```
remote tip bc38583d9
local 5ed9567 -- 295 file(s), 11 changed, 0 removed
tree 5c54a5785 (11 entries)
commit 5ed956747
refs/heads/master: bc38583d9 -> 5ed956747
VERIFIED
```

**39 seconds**, 11 blobs instead of 295, and the rebuilt commit's SHA is
**byte-identical to the local one** -- because the remote tip was the local parent
and the tree was reproduced exactly, so the reconstruction is the commit that was
tested. Deletions are sent as `sha: null` entries and take their mode from the
entry being removed, since an executable removed as `100644` is a different
object.

**What this is an instance of.** The same shape as everything else in this audit:
a step that reports success while doing nothing. The difference is that this one
was in the process rather than the product, and it made four correct findings look
like four missing ones. The generalisable rule is the one already applied to every
gate here -- **read the state, not the report**. For a push that means
`GET /git/ref/heads/<branch>` compared against the local SHA (`push_incremental.py`
ends by printing `VERIFIED` only when they are equal), and never the exit status of
the upload.

**Verified end to end.** The commit this pushed, `5ed9567`, ran green on CI with
all three pre-registered criteria met:

| criterion, stated before the run | result |
| --- | --- |
| the battery artefact's REDUNDANT row reads `tests_run: 21` where it read `0` | `21`, basis `summary`, diagnosis `tests_passed` |
| the four rows of the scorer-stability battery stop being identical | `2/14`, `2/14`, `1/15`, and `no summary in its output` -- identical to the local run |
| the three newly wired batteries appear and pass | all three steps success; `12 caught`, `5 caught`, negative control `0 29 OK` |

Both workflows -- `CI` including the cold-tree job, and `Anchor round trip` --
completed `success`.

---

## Finding 150 — the mode that had no consumer now has one, and it is the blocks that get executed

**What was outstanding.** `--stdin` was added to `check-no-unsafe-shell.mjs` under
finding 131 and has been listed as open in every round since: the mode was
correct, tested by its own fixtures, and **nothing invoked it**. Its own docstring
says why it exists --

> the gate checks the repository, and the failure was in a **command that was never
> in the repository**

-- and the tracking document recorded the gap in the shape this campaign keeps
finding: *the mode is a capability, whether it is used is discipline*. A rule
applied only when someone remembers to apply it is not a gate.

**The measurement that found the consumer.** `check-no-unsafe-shell.mjs` scans by
extension, and its list is source files: `mjs|cjs|js|ts|json|sh|py`. `docs/user-guide.md`
is not one. But `check-user-guide.mjs` **executes** that document's ```` ```bash ````
blocks -- concatenated in order, through `bash`, with `set -e`. So the repository
held nine shell commands that a gate performs on every run and that no gate had
ever looked at. That is the consumer, and it is not a decorative one: the rule is
about `$`-constructs a shell expands **before the program it names starts**, and
the failure is silent.

**Why running them cannot substitute for checking them.** `${count}` inside a
double-quoted argument expands to nothing, the program receives an empty string,
the step exits 0, and what ran is not what the guide documented. A walkthrough
that runs clean is exactly what a block with this defect looks like from outside.
The operator of this repository lost three tool calls to `Bad substitution` while
every gate here was green -- the same defect, at the tool boundary, which is why
`--stdin` was written; this finding closes it for the one place in the tree where
commands are *performed* rather than *stored*.

**What was measured first.** All nine blocks were piped through the gate before
anything was changed:

```
bash blocks: 9
flagged: 0 of 9
```

So this is not a repair of an active defect in the guide. It is the removal of a
channel: from now on a block that would be silently mis-expanded cannot reach
execution, and the guard against that is exercised nine times on every run rather
than never.

**The change.** `check-user-guide.mjs` runs each runnable block through the shell
guard before executing it, one block at a time, each with `--label
user-guide block N` so a failure names the fence rather than a line of a generated
script nobody can see. Two decisions are deliberate and both are about refusing a
quiet path:

- **the check is applied to the same set the gate executes**, keyed on the fence
  tag, so a ```` ```json ```` sample of command output -- which this document is
  full of -- is shown and not checked. A content-based scan of the markdown would
  flag the samples, and the guide gate's whole design is that the tag, not the
  content, is the contract.
- **a missing sibling guard is a failure, not a skip.** The guard is consulted on
  every run; if it cannot be found, this one no longer knows that what it is about
  to execute is safe. Skipping would restore precisely the state the pass was
  added to end, while still reporting success.

**Tests.** Two, and the second is the control that keeps the first from being
satisfiable by a broader rule. A sandbox guide whose bash block carries
`node -e "console.log(${count})"` must fail with `nested-interpreter-expansion` in
the message and the block named; a sandbox guide holding the same text inside a
`json` fence, beside one clean bash block, must pass. The sandbox now copies the
sibling guard too -- the real one, not a stub, because the property under test is
that the shipped rule is what runs.

Before the change the first test was red with `expected +0 to be 1`: the gate
accepted the hazardous block, which is the defect stated as an exit code. Removing
the check afterwards reddens that assertion and only that one; restoring it
returns the file to 14 passed.

**Acceptance.** The real document still passes end to end --
`check-user-guide: OK (9 bash block(s) executed in order)`, fences
`bash=9 json=5 text=2 ts=1` -- so the check runs nine times per gate invocation and
refuses nothing. Full suite **3308 passed / 0 failed** across 126 files; coverage
**99.96 / 99.91 / 100 / 99.96**; `lint`, `typecheck`, `docs:check:cold`,
`docs:counts:check`, `examples:check`, `examples:bundle:check` and `official:check`
all rc=0. Counts retaken: core 126/3308, cli 3/173, repo 129/3481.

---

## Finding 151 — the tracking row was counting the instrument, not the property

**What was outstanding.** P1-6 in the tracking document asks for a meta-criterion
over every gate: *for each enumerating or asserting gate in `scripts/check-*.mjs`
there is a test proving that removing it turns a test red*. Its status read
"partially complete (3 of 8 gates)" and stayed there across rounds while the gate
list grew to thirteen.

**The measurement.** The criterion is a mutation property, so it was measured
rather than read. Each gate was hollowed by inserting `process.exit(0)` after its
import block -- making it report success unconditionally -- and the test files
that name it were run. Those are the only files that could notice; running the
whole suite per gate would take an hour and cannot produce a different verdict,
because a file that does not name the gate cannot be the proof of it.

```
CAUGHT      check-cli-reference.mjs                      11 test(s) red
CAUGHT      check-data-model-vocabularies.mjs            10 test(s) red
CAUGHT      check-doc-counts.mjs                         12 test(s) red
CAUGHT      check-l4-status.mjs                          14 test(s) red
CAUGHT      check-no-absolute-paths.mjs                  28 test(s) red
CAUGHT      check-no-mock.mjs                             9 test(s) red
CAUGHT      check-no-secrets.mjs                          6 test(s) red
CAUGHT      check-no-unsafe-shell.mjs                    27 test(s) red
CAUGHT      check-no-vendored-data.mjs                   10 test(s) red
CAUGHT      check-official-registry.mjs                  17 test(s) red
CAUGHT      check-official.mjs                           51 test(s) red
CAUGHT      check-readme-sample.mjs                      10 test(s) red
CAUGHT      check-user-guide.mjs                         16 test(s) red

gates: 13  caught: 13  survived: 0  no-test: 0
```

**The property already held, for every gate.** What "3 of 8" counted was a
**mechanism**: the gates carrying a dedicated "runs clean here, fails on a
synthesised violation" block in `gates-are-testable.test.ts`. The criterion is
broader than that block, and measured as written it was satisfied thirteen times
over. So the row reported the instrument rather than the property, and the cost of
the misreading was real: an item believed to be three-eighths done was in fact
done, and the rounds spent on it were spent on the wrong thing.

This is the sixth instance in this campaign of a carried gap dissolving under
measurement -- findings 107, 108, 109, and the P0-3 and P0-4 rows before it -- and
the first where the misleading number was a *completion count*. The common cause is
worth stating plainly: **a status written from the mechanism drifts away from the
property it was meant to summarise, and nothing re-reads it.**

**Why it is now a mechanism rather than a one-off audit.**
`scripts/verify-gates-are-testable.mjs` performs the hollowing, takes its subjects
from the directory rather than from a list, fails on any `SURVIVED` or `NO-TEST`
gate, refuses a run whose subject list came back empty, and verifies its own
restores by reading each gate back and comparing. It is named by
`verify:gates-are-testable` in `package.json` **and** by its own step in `ci.yml`,
because finding 148 recorded at a scale of three what "green by hand and named by
nothing" costs.

**What it does not establish.** It hollows the **whole gate**. A narrower edit --
gutting one rule inside a gate while the rest still works -- is not caught by it,
and finding 46 is exactly that case: the enumeration inside `check-official.mjs`
was deleted while cases were diverted past the count, and the file stayed green.
That rule-level property has its own mechanism: `golden-master/gate-sites.json`
enumerates every failure exit with a pointer to the test that proves it, checked by
`gate-sites-are-proven.test.ts`. This finding added three sites to it (45 now), each
annotated `proved` and pointed at the new file. The two are complements: one says a
gate cannot be emptied unnoticed, the other says each of its failure exits is proved.

**Tests, and two of them are the audit's own verdict logic.** The new file does not
run the audit against the real tree -- that would put a hollowed gate under
concurrent readers, which is the hazard finding 145 was about, and would nest
vitest inside vitest. It runs it against a **sandbox**: a throwaway tree with one
gate, one test naming it, and a stub `npx` that decides what the audit observes.
Two controls follow from that, and each is a real branch of the audit:

| control | stub | asserted |
| --- | --- | --- |
| a gate survives | exits 0, prints nothing | rc=1, `SURVIVED`, names the gate, `restored byte-for-byte: 1 of 1` |
| a gate is caught | prints a failure line, exits 1 | rc=0, `gates: 1  caught: 1  survived: 0  no-test: 0` |
| no gate exists | either | rc=1, `no check-*.mjs gate was found` -- the vacuity guard, proved rather than read |
| the restore fails | swaps the gate for a symlink to `/dev/null` | rc=1, `could not restore` -- the write is discarded, so the read-back comparison must fail |

The fourth is a deterministic filesystem property rather than a mock, and it exists
because "a battery that cannot put its subject back reports success" is the defect
finding 142 repaired in three other batteries.

**One of my own detectors was wrong, again.** The first version of the scope test
asserted that no gate filename appeared in the audit at all, and it failed on
`check-official.mjs` -- which the audit *mentions in prose*, in the paragraph
explaining what finding 46 found. A name-absence check cannot tell a mention from a
use, which this repository has now recorded three times in its own scanners
(findings 127, 133, and the `cwd: sandbox` substring in 140). The assertion is now
about the derivation -- the subjects come from `gates()`, which reads the directory
-- and the wrong version is recorded in the test's own comment rather than deleted.

**Acceptance.** Full suite **3314 passed / 0 failed** across 127 files; coverage
**99.96 / 99.91 / 100 / 99.96**; the audit green against the shipped tree (13
caught, 13 restored byte-for-byte); `lint`, `typecheck`, `docs:check:cold`,
`docs:counts:check`, `examples:check`, `examples:bundle:check` and `official:check`
all rc=0; `gate-sites.json` re-derived to 45 sites, all `proved`, `--check` green.
Counts retaken: core 127/3314, cli 3/173, repo 130/3487.

---

## Finding 152 — three defects in the audit, each found by its behaviour rather than by reading

`scripts/verify-gates-are-testable.mjs` was written under finding 151 to hollow
every gate and fail if one survives. It passed here on the first run and reported
`caught: 0, survived: 13` on CI. What followed was three distinct defects, and none
of them was visible in the source.

### The first: the audit had the defect it audits

```
gates: 13  caught: 0  survived: 13  no-test: 0
```

Every gate reported as unguarded, on the runner only. The cause was the detector:
it looked for a line whose first non-space character is `×`, and a runner
colourises, so the line is `\x1b[31m×\x1b[39m …` and begins with an escape. That is
the same defect findings 147 and 148 repaired twice each in the readers of vitest's
summary -- **in the audit, written by the same author, in the same session, after
reasoning about it at length.** It was caught because a SURVIVED gate fails the
run; the script's failure mode is loud by construction, which is the only reason
the divergence surfaced at all.

The repair is not only `stripAnsi`. Reading the verdict from the exit status alone
would be worse: `npx vitest run <files>` exits non-zero when a test fails **and**
when there was nothing to run -- a suite that never collected, a path that does not
exist, a syntax error. Crediting those as CAUGHT is reading a crash as a proof, so
the status must be non-zero **and** the output must name a failing test, and a run
that fails without naming one is its own state (`UNATTRIBUTED`) that fails the
audit.

### The second: the hollowing made one gate a syntax error, and its crash was credited

The mutation was inserted after the last line beginning with `import`. For
`check-official.mjs` that line is the **opening brace of a multi-line import**:

```
import {

process.exit(0);
  exportForScoreTarget,
```

So the mutated gate did not parse, its tests failed for that reason, and the row
read `CAUGHT … 51 test(s) red` -- a syntax error credited as proof that the gate's
tests notice its removal. The over-claim was invisible locally because a crash and
a caught mutation produce the same evidence, which is exactly the shape this audit
exists to find.

The repair has two halves, because either alone is insufficient. The mutation is
now placed as the **first statement** (skipping a shebang), which ESM hoisting makes
equivalent and which cannot break the grammar. And the mutated source is **parsed
before it is trusted**: a candidate that does not parse is reported as `UNPARSABLE`,
never written, and fails the run.

### The third: it does not put the file back when it is killed

A run of the audit was killed by an ending turn while it held
`scripts/check-official.mjs` hollowed, and the next `git status` showed that gate
modified in the working tree:

```
@@ -51,6 +51,8 @@ import { dirname, join, resolve } from 'node:path';
 import { fileURLToPath } from 'node:url';

 import {
+
+process.exit(0);
   exportForScoreTarget,
```

Every step after that would have read a gate with its verdict removed as the
shipped gate -- the failure finding 142 repaired in three batteries and finding 148
in the ones nothing invoked, committed by the script that exists to find it.

The first repair was a `SIGINT`/`SIGTERM`/`SIGHUP` handler and **it does not cover
the case that was observed**. During `spawnSync` the event loop is blocked, so a
handler registered with `process.on` cannot run until the child exits, and that is
precisely where the kill arrived; a test that asserted the handler with a 5-second
timeout failed, which is what prompted the check. A `SIGKILL` cannot be handled by
any process at all.

So the restore is not attempted at kill time. The bytes are journalled to
`node_modules/.cache/verify-gates-are-testable.json` **before** the mutation, and
the next run repairs from it before measuring anything -- a sweep that covers an
exception, a signal, a blocked event loop and `SIGKILL` alike, because all four
leave the same journal. A journal that cannot be read, or a repair that does not
land, is reported and fails the run rather than continuing: measuring a gate the
script knows is not the shipped one is the reading the journal exists to prevent.

### Tests

Eleven, and each one is a branch of the audit or a property of its scope:

| assertion | why it is there |
| --- | --- |
| subjects come from `gates()`, which reads the directory | a list that must be updated cannot see what it is missing |
| an empty subject list is refused | the vacuity guard, proved rather than read |
| a failure the runner coloured is read | **the CI failure**, reproduced locally with `FORCE_COLOR=1` |
| a failure naming no failing test is refused | a crash must not be credited as proof |
| a mutation that cannot parse is refused | **the over-claim**, and the gate is left unwritten |
| a journalled gate is repaired before measuring | **the leak**, asserted without a signal's timing |
| an unreparable journal fails the run | the sweep must not continue on a gate it cannot trust |
| a restore that does not land is reported | the in-run equivalent, via a symlink to `/dev/null` |
| a survivor fails the run | the verdict discriminates |
| a caught gate passes it | the other direction, so "fails on everything" cannot satisfy the first |
| both a package script and a workflow name it | finding 148's defect at a scale of three |

### Verification

Under the runner's condition, reproduced locally with `FORCE_COLOR=1`:

```
gates: 13  caught: 13  survived: 0  no-test: 0  unattributed: 0  unparsable: 0
restored byte-for-byte: 13 of 13
verify-gates-are-testable: OK (13 gate(s), each caught by at least one test)
```

with `git status` showing no gate left modified and the journal removed. Full suite
**3319 passed / 0 failed** across 127 files; coverage **99.96 / 99.91 / 100 /
99.96**; `gate-sites.json` re-derived to 46 sites, all `proved`; the seven gates
`lint`, `typecheck`, `docs:check:cold`, `docs:counts:check`, `examples:check`,
`examples:bundle:check` and `official:check` all rc=0. Counts retaken: core
127/3319, cli 3/173, repo 130/3492.

### The runner caught a stale expectation, which is why the battery has a reconciliation mode

The first CI run of this round reported, from the runner:

```
backend-support: 14 caught, 0 survived, 0 inert, 1 misattributed, 15 injection(s)
```

One injection made the test file red, but **not on the test it named**. The cause
was mine: the test `fails on a query error carried inside an HTTP 200` had been
reworded to `... carried in the body of an HTTP 200` while correcting the comment
that the real Prometheus disproved, and the battery was pushed without being re-run.
The local verdict had been 15/15 because it *predated* the rename.

A stale expectation is silent in exactly one direction: the battery reports
`MISATTRIBUTED` rather than `CAUGHT`, and a reader who only looks at the count sees
"one short". So the battery now has a mode that reconciles its own expectations
against the files they name:

```
python3 scripts/injection/backend-support.py --verify-expectations --probe
backend-support: OK (15 expectation(s), with the comparator probed)
```

`--probe` is a negative control on the *comparator* rather than on the data: it also
requires a name that cannot exist to be reported missing, so the check is shown to
discriminate rather than merely to be quiet. `check-backend-support.test.ts` drives
it, so the next rename fails locally instead of on the runner.

Writing it found a second case immediately: the `NaN`/`+Inf`/`-Inf` cases were one
`it.each`, whose titles exist only at run time, so no source string could be
reconciled against them. They are now three named tests, which makes the
expectation exact and names the failing value in the report.

**Residual**: the reconciliation covers *this* battery. The other twelve write
their expectations in their own table formats, and a general version would have to
read each format -- worth doing, not done here.

### What this does not cover, stated because the census cannot

`inject-stability.mjs`, `inject-component-rule.mjs` and `inject-m1-ceiling-tests.mjs` mutate tracked
files and restore them at the end of a loop, exactly like the Python batteries. They carry no
`INJECTIONS` table, and the register admits a file to its census by `table && writes` -- so they are
outside the guard **and** outside the census, and a kill during one of them leaves a mutation with no
record to repair from.

That is the same defect this finding is about, in three files the guard cannot reach and the guard's
own coverage check cannot count. Writing "every battery is guarded" here would have been false in a
way nothing would catch, which is the shape this document keeps recording.

### What this says about the method

Three defects in a script whose entire purpose is to find this class of defect,
written in one sitting, after this campaign had already recorded the class four
times. Reading the source would have found none of them; the second and third were
found by *running* it -- once on a runner, once by being killed. The generalisable
rule is the one this audit applies to everything else: **a mechanism is only known
to work when something outside it has tried to make it fail.**

---

## Finding 153 — the gate read three shapes, the document used nineteen, and the row it could not read was the defect it was written for

### What was already recorded as open

`check-doc-counts.mjs` (finding 123) holds the counts published in
`docs/progress.md` to the scopes they claim. Its own round recorded what it did
not do:

> **未覆盖 `readCounts` 三种模式之外的第四种写法**——出现第四种写法的话**没有任何东西会发现它**

That is the whole finding, written down and left. This round measured it.

### The measurement

The subject is not "the counts the reader matched" -- that is the reader
describing itself. It is **every table row that carries a count**: a number and,
as its own word, one of `files`, `file`, `tests`, `test`, `passed`.

| quantity | count |
| --- | --- |
| table rows carrying a count phrase | **88** |
| rows the three shapes read | **25** |
| rows skipped, and therefore checked by nothing | **63** |

The three shapes were `N files, M tests passed`, `N files, M tests` and
`N passed / M files`. The document also published `N passed (M files)` (seven
rows), `N passed` (twelve), `N tests across M files`, `N failed / N passed`,
`N tests pass`, and `N files throughout`. None of them was read, so rules 1 to 3
-- scope naming, monotonicity, current-state equality -- applied to **none** of
the rows written in them.

An unread row is not a neutral omission. **A shape the reader cannot read is
indistinguishable from a shape that is not there**, which is why the gap could not
be found from inside the guard: the guard had nothing to compare against.

### The row it was hiding

`Pass 26`'s verification table begins:

```
| core | 2623 passed (87 files); `src` 100 / 100 / 100 / 100 |
```

Two independent readings say this is not a `core` row.

**The file count is impossible for `core`.** `packages/core/test` has never held
87 test files -- not at that commit, not at any commit: `git ls-tree -r` over all
189 commits of the repository finds no revision with `core = 87`. What had 87
files at that moment was every workspace: 84 in `packages/core` plus 3 in
`packages/cli`.

**The test count closes the same identity.** `2623 = 2445 + 173 + 5`, which is
Pass 25's own `core coverage` row (2445) plus that table's `cli` row (173) plus
the five tests Pass 26 added. And when a later pass records `core` again it
records **2500**, then 2512 -- not 2623.

So the row published the whole workspace's count under the label `core`. That is
the defect the guard exists for: finding 123 was two rows labelled `test suite`
carrying two different scopes, and this is the same mistake in the same file, in
the one shape the reader could not read. Every gate was green for fifteen passes.

### The fix

Rule 4, stated at the granularity the other rules work at: **a row that names a
scope must have its count read, or the unreadable phrase must be excused in
writing.**

| part | change |
| --- | --- |
| the reader | restricted to table rows, and given `N passed (M files)` -- the shape that hid the defect -- by extending the bare-test shape to consume an optional parenthesised file count |
| the bare shape | `N passed` is read **only** on a row that names a scope, because a battery verdict reads the same way (`\| mutation \| 26 passed \|`) and demands a scope it does not have |
| rule 4 | every count-bearing phrase in a scope-named row must be read, or its shape must be in `UNMEASURED` |
| the exemption table | keyed on the *clause* around the phrase (`217 file x dimension pairs`), not a line number, because a key that moves on every unrelated edit gets re-signed without being read |
| the table's own validation | an exemption with no reason, with a reason under 40 characters, or sharing another entry's reason, fails the run -- an exemption list nobody checks is the same blind spot one level in |
| the document | the row is relabelled `repo`, with the arithmetic written beside it, because a record of the wrong scope is not a record |

The measured result of the fix on the shipped file: **44 rows read** (from 25),
**one** phrase excused, and **exactly one** rule violation -- the `core` fall from
2623 to 2512, which is the mislabelled row itself.

### Subject, and the two residuals, stated rather than implied

The subject is **table rows**. Rules 1 to 3 are each defined over a row -- a label
cell, an order over the file, a marker -- and a count narrated in prose has none
of those. Two gaps remain and are recorded in the guard:

- a stale number narrated in **prose** still has no reader;
- a suite count in an **unrecognised shape under a label that names no scope** is
  outside rule 4 too, because such a row is worded exactly like the battery
  verdicts that share its wording and are not suite counts.

### The battery, and the test it found

`scripts/injection/doc-counts-shapes.py` mutates twelve parts of the fix --
the two added shapes, the scope gate, rule 4, the exemption lookup, the table's
three refusal branches, the clause key, both halves of rule 2 and rule 3, and the
row/prose boundary -- and requires the gate's test file to go red **on the named
assertion**, reporting `MISATTRIBUTED` separately from `CAUGHT` so an unrelated
failure cannot be credited as a proof.

Its first run reported one SURVIVED, and the mutation was right. Deleting
`N passed (M files)` outright left the file green, because the test that claimed
to pin it only asserted exit 0 -- and the **bare** shape also makes that row
green: it reads the 2403 and ignores the 82. The file count was being read and
never used. The repair is a test that makes a rule *use* it: `12 passed (999
files)` must be refused for more files than tests, which only the pair shape can
see. Second run: **12 caught, 0 survived, 0 inert**.

Two more gaps came out of writing the battery rather than from running it: every
existing monotonicity fixture fell by hundreds of tests, so `row.tests < prev.tests
- 1` -- a bound that lets a real one-test regression through -- was indistinguish-
able from the rule; and no fixture ever disagreed with the live measurement on
`files` alone, so the first half of rule 3's equality could be deleted silently.
Both now have a test.

### One word removed from the census, with the proof

The census reads "a number and a unit word", and `passed` is not one of the units.
The reason is provable: rule 4 only examines rows the reader did *not* read, an
unread row is one where the bare shape did not match, and such a row therefore
contains no `N passed` phrase. A unit the census can never see would be dead
weight that reads like coverage -- the failure this whole guard is about. Recorded
where the vocabulary is, with the test's own limitation said out loud: the fixture
that exercises it passes with or without `passed` in the list, so it pins the
reading and not the vocabulary.

### Verification

| gate | result |
| --- | --- |
| `check-doc-counts` on the shipped document | **44 published count(s)**, all scoped, 1 phrase excused |
| `check-doc-counts.test.ts` | **29 tests**, was 14 |
| new battery | **12 caught / 0 survived / 0 inert** |
| core test suite | **127 files, 3334 tests passed** |
| cli test suite | **3 files, 173 tests passed** |
| repo test suite | **130 files, 3507 tests passed** |
| coverage | **99.96 / 99.91 / 100 / 99.96** |
| `gate-sites.json` | re-derived, 46 sites, all `proved`; the one moved site re-signed by hand |
| `typecheck` / `lint` / `docs:check` / `docs:counts:check` | clean |
| prose `--stdin` line in the Open list | corrected: finding 150 gave it the consumer it lacked |

### What this says about the method

The guard was built to catch a mislabelled scope and spent fifteen passes unable
to see one, in the file it guards, in a shape it had no name for. The version that
only reads what it recognises cannot report its own blindness -- and the record of
that blindness was already in the document, one line long, filed under "not done".
The two things that broke it open were a census of the subject rather than of the
matcher, and a battery that would not let a test claim to pin a shape it never
used.

---

## Finding 154 — the six backends were a to-do, and "supported" was a word with no measurement

### What P1-5 asked for, and what was there

The roadmap's P1-5 reads: *measure T2's six backends one by one and record them,
declaring the ones that cannot be supported explicitly*. `T2` names Prometheus,
Jaeger, Loki, Elasticsearch, ClickHouse and the Kubernetes API.

Measured at the revision this finding starts from:

| what | state |
| --- | --- |
| modules under `packages/core/src/ingest/` | **three** -- `file.ts`, `otlp.ts`, `prime.ts` |
| modules that *reach out* to a backend | **none** |
| places the support status was recorded | one Chinese sentence in the tracking document |

The two ingest paths that existed read what a caller already has: a file on disk,
or a payload posted to us. Neither has an input that can be absent, slow,
unauthorised or wrong in the way a network peer can, which is why "we support
Prometheus" could not have been true and could not have been false either -- there
was nothing to measure.

### What was built

One pull path, end to end, and a registry that says which of the six have one.

**`packages/core/src/ingest/prometheus.ts`** speaks `GET /api/v1/query_range`,
reads a `matrix` result, and maps each sample to an IR metric signal. Every
branch is a *network* fact rather than a parse fact:

| branch | why it exists |
| --- | --- |
| unreachable host, timeout | reported as an error rather than thrown, because a puller that throws cannot be driven by a table of cases, and this module's whole test surface is one |
| non-2xx | quoted with the body, so a 503 from a proxy is distinguishable from a 400 from the query |
| body is not JSON | named with the endpoint, because a proxy's HTML error page is the most common way this happens |
| no `status` field | the envelope is not the API's |
| `status != success` | the API's own verdict, which no status code carries |
| result type is not `matrix` | a `vector` is an instant query, not the range that was asked for |
| no `__name__` | a series with no metric name would otherwise be named after nothing |
| no service label | the label carrying the service is *declared by the caller*; guessing it would attach every sample to the wrong service |
| `NaN` / `+Inf` / `-Inf` | legal time-series values with no JSON number form; Prometheus writes them as strings, and a reader that expects numbers emits `undefined` -- which is how finding 119's round trip reported 122 cases as a bare `NaN` no reader could attribute |

`semanticType` is deliberately **not** set: it is a vocabulary for a consumer to
map into, and a guess presented beside measured values is the kind of claim this
repository refuses. The puller also does **not** retry: the repository's retry
policy lives in `fetch-official.mjs` with its own exit-code contract (finding 52),
and a second, quieter one inside the ingest layer would eventually disagree with it
about which failures are retryable.

### The claim, and the three links that hold it

`packages/core/src/ingest/backends.ts` is the registry: six ids, and for each
either the function that pulls or the reason it cannot be pulled from. A sentence
saying "supported" is a claim with no reader, so three things read this one:

| link | reader | what it proves |
| --- | --- | --- |
| registry -> snapshot | `packages/core/test/backend-support.test.ts` | `golden-master/backend-support.json` equals what the registry derives, so the snapshot cannot be stale without a red suite |
| capability -> test | the same file, iterating the registry | **every backend called `implemented` is driven over a real socket**, so "supported" is exhibited rather than asserted; a registry entry with no driver fails |
| snapshot -> document | `scripts/check-backend-support.mjs` | every row of `docs/architecture.md`'s matrix matches the snapshot in status *and* description; a missing row, an extra row, a duplicate row, a third status and an empty snapshot all fail |

The registry and the document are deliberately not the two ends of one check: a
document compared with another document only proves the two agree. `check-backend-
support.mjs` reads two files, so it runs in `docs:check` **and** in the cold-tree
job -- measured, not assumed: with `packages/core/dist` moved aside it exits 0.

### The measurement against a real Prometheus

The fixture servers in the test are real HTTP but they are not Prometheus, so the
round downloaded one. The release asset is unreachable from this sandbox
(`HTTP 000`), and the distribution package is available:

```
prometheus, version 2.45.3+ds (branch: debian/sid, revision: 2.45.3+ds-2ubuntu0.3)
```

Run on `127.0.0.1:9095` with a 5s scrape interval, scraping itself, and driven by
**this repository's own puller** through `packages/core/dist/index.js`:

```
query  prometheus_tsdb_head_samples_appended_total, last 90s, step 10s, serviceLabel: 'job'
signals: 2   quarantine: 0   warnings: []
first signal: {"irVersion":"2.0","resource":{"service.name":"checkout"},
  "timestamp":"2026-10-12T00:17:43.000Z","rawOffsetMinutes":0,"signal":"metric",
  "payload":{"kind":"metric","name":"prometheus_tsdb_head_samples_appended_total",
  "value":304,"tags":{"instance":"127.0.0.1:9095","type":"float"}},
  "provenance":{"payload.value":{"source":"direct"},"payload.name":{"source":"direct"},
  "timestamp":{"source":"direct"}}}
```

Three further readings against the same server:

| request | real Prometheus answers | our reader |
| --- | --- | --- |
| `rate(` (parse error) | **HTTP 400**, `{"status":"error","errorType":"bad_data",...}` | `ok: false`, error names `400` and the body |
| a range exceeding the 11,000-point limit | **HTTP 400**, `status: error` | `ok: false` |
| `no_such_metric_here` | HTTP 200, empty matrix | `ok: true`, 0 signals, 0 quarantine |
| `up`, with no service label declared | — | `ok: true`, 1 quarantine: no `'service'` label |

**And the real server disproved a claim this module was carrying.** The comment on
the `status != success` branch said Prometheus "reports a failed query with HTTP
200 and `status: error`". It does not: both a parse error and a resolution error
come back as **HTTP 400**. The branch is still needed -- the body's verdict is the
only thing that makes the reader correct against an endpoint that answers 200 --
but it is a **defence rather than a reproduction**, and it now says so. The
fixture that exercises it is labelled the same way.

### The battery, and the vocabulary earning its keep

`scripts/injection/backend-support.py` removes one link at a time: seven refusals
from the document guard, the stale-snapshot branch of the derive script, six
branches of the wire reader, and the registry's agreement with its own snapshot.
Fifteen injections, and it requires the gate's test file to go red **on the named
assertion**, reporting `MISATTRIBUTED` separately so a crash cannot be credited as
a proof (finding 152).

Its first run reported **one INERT**, and the vocabulary is why that mattered: the
anchor for the non-finite-value mutation had eight spaces of indentation where the
source has six, so nothing was mutated. Reported as `SURVIVED` it would have read
as "the test does not cover NaN"; reported as `INERT` it is one line of diagnosis.
Second run: **15 caught, 0 survived, 0 inert**.

### The status of the other five

Each is declared `unsupported` **with what its wire format requires and this
repository does not have**, because "not implemented yet" reads the same whether
the work is a week or impossible:

| backend | what it would take |
| --- | --- |
| Jaeger | a second trace decoder beside `ingest/otlp.ts`: hex span ids, a process table separate from the spans, no OTLP resource attributes. Jaeger emits OTLP natively, which is the supported path |
| Loki | a LogQL reader whose streams carry label sets Loki chose, so the service is a label the caller must name; guessing it attaches every line to the wrong service |
| Elasticsearch | a field mapping supplied by the caller, because the timestamp, message and service fields are per-index decisions under dynamic mappings |
| ClickHouse | either a schema this project does not own, or arbitrary SQL, which would make the ingest path untyped |
| Kubernetes API | credentials the ingest path has no business holding, plus a translation from `involvedObject` to the OTel resource attributes the IR is built on |

These are declarations, not attempts: **no Jaeger, Loki, Elasticsearch, ClickHouse
or Kubernetes endpoint was contacted**, and reading the wire format is not the same
as having been refused by it.

### Verification

| gate | result |
| --- | --- |
| `prometheus.test.ts` | **35 tests** over real HTTP, including a socket that never answers and a refused connection |
| `backend-support.test.ts` | **10 tests**; every `implemented` backend driven over a socket |
| `check-backend-support.test.ts` | **14 tests**; both scripts driven against fixtures, including a deliberately corrupted snapshot, plus the battery-expectation reconciliation below |
| new battery | **15 caught / 0 survived / 0 inert** |
| cold-tree measurement | `check-backend-support.mjs` exits 0 with `packages/core/dist` moved aside |
| `docs:check` / `docs:check:cold` / `typecheck` / `lint` | clean; the guard is a member of both aggregates |
| `gate-sites.json` | 48 sites, all `proved`; the two new sites authored by hand |
| `scripts-are-classified` / `export-surface-enumerated` / `cold-tree-job` | each failed on the two new modules and the new guard until the register, the module list and the cold membership were updated -- which is those three guards doing their job |
| core test suite | **131 files, 3419 tests passed**; `cli` 3 files, 173 tests |
| coverage | **99.96 / 99.91 / 100 / 99.96**; `prometheus.ts` and `backends.ts` each **100 / 100 / 100 / 100** |

### What is not claimed

- **No CLI command.** The puller is reachable through the package's entry point
  and the registry, not through `rca-bench`. Adding one means a new command in
  `docs/cli-reference.md` and a new column in that gate's comparison, which is a
  separate change.
- **One of six.** Five backends have a written reason and no reader.
- **Not a hosted service.** `prometheus` means the query API, and the version that
  was measured is named above; nothing here says anything about a particular
  deployment's remote-write configuration, retention or federation.

### What this says about the method

The requirement asked for six measurements and the honest answer at the start was
"none, and here is a sentence". The work is not that a puller now exists -- it is
that the claim "we support Prometheus" acquired a reader at three levels and a
server that could contradict it. It did contradict it: the one-line comment about
which status code a failed query returns was wrong, and nothing but contacting a
real Prometheus would have said so. That is the same shape as finding 153's
mislabelled row -- a claim that survived because nothing that could disagree with
it had been pointed at it.

---

## Finding 155 — P0-1 closed, and the number it closed on lived only in a log line

### The result

The requirement this repository has carried longest is P0-1: *fetch RCAEval's real
corpus, round-trip it through this project's export, and score it with RCAEval's own
published rule*. It has been open since the first iteration, and finding 114 is
what turned it from "the sandbox cannot reach Zenodo" into "dispatch the workflow
and read the answer".

The answer, on run `38250480271` at `167e08f28`:

```
VERIFIED  rcaeval-re1-ob: bytes=30966778 sha256=4a709297e0a8...
VERIFIED  rcaeval-re1-ss: bytes=79089075 sha256=b4424b0b3863...
VERIFIED  rcaeval-re1-tt: bytes=279663965 sha256=2b33b7ab0719...
REPORT    /tmp/pins.json: 3 pin(s) measured
apply-pins: OK (3 pin(s) agree with the report; nothing written)
registry pins agree with this download
... 375 lines of `ROUNDTRIP PASS <n>/375 ... oracle=1.00 ...`
ROUNDTRIP PASSED (375 case(s) round-tripped through the official layout)
```

**375 of 375.** Finding 119 measured 253 of 375 and finding 121 established that
the other 122 were one system's `NaN` cells, declared as gaps in the corpus's own
plaintext; the semantics from that round are what this run exercised. All three
asset digests were verified against `golden-master/official-assets.json` and agree,
so P0-1's third acceptance item needed nothing merged.

### What was wrong with the record, which is the finding

The result existed in exactly one place: a line in a workflow log. Nothing in the
repository published it, and what the repository *did* publish was a **different
run's number stated in the present tense**:

> - It does **not** re-run RE1, so the pass count is still Pass 31's 253 of 375.

That sentence was written by the pass that fixed the `NaN` semantics, was true when
it was written, and stopped being true the moment the corpus started passing -- and
nothing in this repository could notice. It is finding 153's shape again: a claim
with no reader, and a reader is exactly what the number needed.

The aggravating detail is that this repository **already has the mechanism**. The
test counts are held to a committed measurement by `check-doc-counts.mjs`; the L4
status table is held to the asset registry by `check-l4-status.mjs`; the T2 backend
matrix is held to a derived snapshot (finding 154). The round trip, the one
measurement that took a year of work to obtain, was held to nothing.

### The fix

| part | what it does |
| --- | --- |
| `golden-master/roundtrip.json` | the last measured round trip: anchor, run id, commit, the corpus's declared case count, the round-tripped count, the oracle, and the three measured pins |
| `docs/progress.md`, `## The last measured round trip` | the published figures, near the top where a reader looks, with what the table does **not** claim written under it |
| `scripts/check-roundtrip-record.mjs` | holds the three of them together: the record's provenance, the corpus partition, the pins against the registry **in both directions**, and all four published figures |

The both-directions half matters. One direction catches a record that vouches for
bytes the registry denies; the other catches a record that quietly omits the asset
that failed to verify, which would read as complete.

The `oracle=1.00` figure is deliberately **not** presented as agreement with
upstream's published accuracy: it is the official rule applied to the ground-truth
root cause, which is the scorer's own ceiling rather than a solver's accuracy. The
comparison P0-2 asks for is still unmeasured, and the document says so under the
table instead of leaving a reader to infer otherwise.

### The guard's own defect, found by its own test

The first version scoped the document by *any line* containing the section's name.
The headline table's L4 row cross-references the section, so that row matched
first, the guard read the rows under it, and every figure came back `undefined` --
four confident complaints about a document that was correct. The correction is one
predicate: the section is the *heading*. The fixture that catches it is in the
battery, which puts the defect back to show the fixture is load-bearing.

### Verification

| gate | result |
| --- | --- |
| `check-roundtrip-record.mjs` on the shipped files | **OK** (375/375 at oracle=1, 3 pins agree, run `38250480271` on `167e08f28`) |
| `check-roundtrip-record.test.ts` | **20 tests**, every refusal branch plus the heading scoping |
| new battery | **17 caught / 0 survived / 0 inert / 0 misattributed** |
| `gate-sites.json` | 49 sites, all `proved`; the new site authored by hand |
| cold-tree measurement | the guard reads three files, and is a member of `docs:check` and `docs:check:cold` |
| `scripts-are-classified` / `batteries-reach-an-invoker` / `cold-tree-job` | each failed on the new guard until the register, the battery list and the cold membership were updated |

### What this does not claim

- **Not the score.** `oracle=1.00` is the scorer's ceiling on ground truth. No
  comparison with upstream's published numbers exists (P0-2).
- **Not RE2 or RE3.** Separate anchors, separate fetches, still at zero.
- **Not that the numbers are current forever.** The record is a measurement taken
  by a workflow that runs weekly; a newer run makes it stale, and only a reader
  who checks the runs list would know. That is stated in the record's own `rule`
  field rather than left as a surprise.

### What this says about the method

The measurement cost a dispatch and an hour; the *finding* is that a year of work
was one sentence away from being invisible, in a file that already holds three
other measurements to gates. The pattern this campaign keeps meeting is not that
numbers are wrong but that they have no reader -- and the remedy is always the
same: name the measurement, publish it where a reader looks, and give something the
job of disagreeing.

---

## Finding 156 — P0-2's score existed as a log line, and the report that was missing had a temporal dead zone in it

### What P0-2 asks for, and what was there

> **P0-2** | record the official scorer's **score** on the real corpus (not only
> that the round trip passed) | produce a comparable score report, and state the
> difference from the published figures

P0-1 closed with 375 of 375 at `oracle=1.00` (finding 155). What P0-2 asks for is
the *score report*, and measured before this round it did not exist. The round trip
prints one line per case:

```
ROUNDTRIP PASS 375/375 RE1-TT/ts-travel-service_mem/5 target=rcaeval-re1 oracle=1.00 signals=1199040
```

and the artifact `official-data.yml` uploaded carried `/tmp/rcaeval-cases.json` and
`/tmp/pins.json` -- the descriptors and the pins, **and no scores at all**. So the
answer to "produce a score report on the real corpus" was 375 lines of log.

That is finding 155's shape one step further on, and it is worth naming the pattern
precisely because this is the third round in a row it has appeared in: the round
trip, the record and now the score each existed as something a human would have to
read a log to find. A measurement that is not an artifact cannot be checked by
anything.

### What was built

**`check-official.mjs --report <path>`** writes the report the round trip computes:

```json
{
  "schema": "rca-bench-rcaeval-scores/1",
  "corpus": "/tmp/official",
  "targets": ["rcaeval-re1"],
  "summary": {
    "declared": 375, "scored": 375, "skipped": 0, "failed": 0,
    "oracle": { "min": 1, "max": 1, "mean": 1, "distribution": { "1": 375 } }
  },
  "cases": [ { "caseId": "RE1-OB/adservice_cpu/1", "target": "rcaeval-re1", "status": "scored", "score": 1 } ]
}
```

Four decisions in it are worth their own sentence each:

| decision | why |
| --- | --- |
| the report is written **before every exit**, including the failing ones | a run that scored 300 of 375 and then failed has measured something, and a report that appears only on success withholds the measurement a reader needs to see why it failed |
| `status` is a closed set -- `scored` / `skipped` / `failed` | `skipped` is the target's own contract refusing the fault class (RE3 refuses non-code faults), which is neither a pass nor a failure; collapsing it into either would make one of them wrong |
| the records cover the **declared** set, not the found one | a case that is declared and absent from the corpus is a `failed` record with that reason; a report whose records cover a subset reads as a report about the whole |
| an empty score set is `null`, not `0` | zero is a score; "no case scored" is not one, and a reader comparing the two would take an empty run for a failing one |

The artifact upload now includes `/tmp/rcaeval-scores.json`.

### The defect the tests found in it

The first version declared `const scoreRecords = []` **after** the loop that fills
the first of its records, so the absent-case branch pushed into a name in its own
temporal dead zone. The script threw a `ReferenceError`, exited non-zero -- which is
the exit code that branch wants -- and wrote no report.

That is a defect with a very specific signature: **a crash wearing the costume of a
correct verdict.** The absent-case exit code is `1` whether the reason is "the case
is missing" or "the reporter is broken", and only the file that should have been
written distinguishes them. The test that caught it is the one asserting a *failing*
run still produces a report, which is exactly the property the ordering decision was
made for.

### The record, and what the guard now checks

`golden-master/roundtrip.json` gained a `scores` block, and
`scripts/check-roundtrip-record.mjs` checks the properties that make a report
readable rather than its arithmetic:

- the block says **where its numbers came from** -- a report with no provenance is
  the defect this record exists to fix;
- `scored + skipped + failed === declared` -- the records cover the declared set;
- `scores.scored === corpus.roundTripped` -- two names for one fact, and they may
  not disagree;
- the distribution accounts for exactly the scored cases, and every key lies inside
  `[min, max]`;
- **the mean equals the distribution's mean**, because a mean written beside a
  distribution rather than computed from it is a second number that can drift;
- an empty score set has `null` for min, max and mean;
- `docs/progress.md` publishes the mean and the worst case, and they match.

The score block for run `38250480271` is reconstructed from that run's own per-case
lines, because the run predates `--report`; the block's `source` field says so, and
the next run fills it from the report itself.

### The comparison P0-2 asks for, and why it is not made yet

`oracle=1.00` is **the official rule applied to the ground-truth root cause** -- the
scorer's own ceiling on the corpus. Upstream's published figures are *solver*
accuracies over the same corpora. The two are not the same quantity, and adding them
to a table beside each other would be the kind of comparison this repository refuses.
What would make them comparable is running **upstream's own scorer, with its own
answer key**, over the same corpus and comparing the two numbers.

That is the remaining half of P0-2. It is now stated in `docs/progress.md` under the
table rather than left for a reader to infer, and it is the next round's work.

### Verification

| gate | result |
| --- | --- |
| `check-official.mjs` without `--report` | unchanged: the nine verdict lines and the summary are byte-identical, asserted line for line |
| `check-official-roundtrip.test.ts` | **52 tests**, five of them new: records cover the declared set, the summary is computed from the records, the failing run still writes, nothing is written when not asked, and no `.partial` survives |
| `check-roundtrip-record.test.ts` | **29 tests**, nine of them new, one per refusal above |
| new battery | **25 caught / 0 survived / 0 inert / 0 misattributed**, one injection per refusal plus the heading-scoping defect |
| `gate-sites.json` | 49 sites, all `proved`; six re-signed by hand after `check-official.mjs` moved |
| core test suite | **131 files, 3433 tests passed**; `cli` 3 files, 173 tests |
| coverage | core **99.96 / 99.91 / 100 / 99.96**; `cli` **100 / 100 / 100 / 100** |

### What this says about the method

Three rounds, three artefacts that existed only as something a human would read a log
to find: the round trip, the record of it, and now its score. Each fix was the same
move -- name the measurement, write it down where a reader looks, and give something
the job of disagreeing -- and each round the *next* layer down was where the
unwritten number was living. The remaining half of P0-2 is deliberately left as a
claim the repository does not make, because the comparison it would need is between
two quantities that are not the same.

---

## Finding 157 — the battery that proves every gate is guarded credited any red as a proof

### What the battery is for

`scripts/injection/gate-tests-battery.py` is the load-bearing member of this
repository's verification story. It takes each gate script and breaks it -- one
anchor at a time, twenty-five of them -- then runs that gate's own test file and
asks whether the suite noticed. Every claim of the form "this guard is guarded"
rests on it, and the meta-gate that asks whether each gate *can* be shown to fail
(`verify-gates-are-testable.mjs`) is downstream of it.

Each row declares, in its fifth field, the specific assertion the mutation is
supposed to break. For example:

```
"README 1. the sample marker stops matching, so nothing is collected"
"the test that a good sample is executed and the test that the marker is what selects it"
```

and the verdict was decided by:

```python
if status != 0 and failed_count(output) > 0:
```

### The measurement

The declared assertion is printed and never compared. So the battery answers *the
suite went red* to a question that is *this test disagrees* -- and those are
different measurements whenever a mutation breaks something else on the way.

Measured, not argued. Prefixing `scripts/check-readme-sample.mjs` with a line that
is not JavaScript:

```
restored byte-exact: True
exit status: 1 | failed: 7
the battery's CAUGHT condition (status != 0 and failed > 0): True
```

A file that cannot be parsed fails every test that imports it, so the exit status
and the failure count are **indistinguishable from a real catch**. Had one of the
twenty-five anchors ever landed inside a multi-line construct, the battery would
have reported `CAUGHT` for a row that demonstrated nothing -- and the report would
have carried a syntax error in its `output_tail` field, forty lines below the
verdict, for a reader to notice.

This is finding 152's defect one script over: `verify-gates-are-testable.mjs`
credited an injection that landed inside a multi-line import as `CAUGHT 51 red`
until it was made to check that the mutated file still parses. The lesson was
written down and applied to that one script.

**And the evidence of the gap was in this battery's own report the whole time.**
Every row persists the runner's failing-test lines. For the twenty-four caught
rows, the names are there -- `scripts/check-readme-sample.mjs · what it asserts
about a good sample > executes a sample block and reports it by number` and so on
-- recorded, printed, and read by nothing.

| quantity | value |
| --- | --- |
| injections | **25** |
| injections whose declared assertion is compared with the failure | **0** |
| injections that currently produce a non-parsing script | **0** |

The last row is why this was a gap rather than an active failure: been-zero is not
the same as cannot-happen, and the whole class depends on the anchors holding.

### The fix

**A declared witness per injection, checked in two places.**

`EXPECTATIONS` states each row's claim in a form a program can disagree with: the
substrings of the runner's failing-test lines that must be present.

```python
EXPECTATIONS: dict[str, tuple[str, ...]] = {
    'README 1. the sample marker stops matching, so nothing is collected': (
        'executes a sample block and reports it by number',
        'picks the sample out by its import rather than by fence position',
    ),
    ...
}
```

`attribute()` decides from it -- `NO_RED` / `CAUGHT` / `UNATTRIBUTED` -- and
`UNATTRIBUTED` is a failure, reported separately from `SURVIVED` because the
repairs are opposite: a survivor says the test does not exist, an unattributed red
says the mutation missed.

The parse guard is the other half, and it runs **before** the suite is invoked, so
an unparseable mutation cannot be credited even in principle. Its verdict is
`UNPARSEABLE`, separate from `UNATTRIBUTED`, for the same reason.

Two reconciliations keep the table from decaying, in the shape findings 156 and
154 established:

| link | what it holds |
| --- | --- |
| `INJECTIONS` -> `EXPECTATIONS` | both directions: no injection without a witness, no witness without an injection |
| witness -> test file | every declared witness must appear as a title in the file its row runs, so a rename fails **locally** instead of turning a `CAUGHT` into an `UNATTRIBUTED` on the runner |
| survivors vs witnesses | a row excused as an expected survivor cannot also claim a witness |

`--verify-expectations --probe` is the mode a test drives, and `--probe` is a
negative control on the comparator rather than on the data: it requires a witness
that cannot exist to be reported missing, so a comparison that never reports
anything cannot be mistaken for one that finds nothing wrong.

The completeness check runs inside `main()` before a file is touched -- a row with
no witness is exactly the state this round measured its way out of.

### The witnesses were not copied from the last run

The obvious way to fill the table is to paste the names the previous report
observed, and it is the wrong way: it would pin whatever the last run happened to
do, including an incidental break, which is the defect rather than the fix.

Each entry was authored from the row's own prose and then reconciled against the
test file's source. The two disagreeing cases are the interesting ones:

- `README 2`'s description says "the dead-branch test's equivalence half: the two
  literals stop being the same string", and the test that carries it is
  `picks the sample out by its import rather than by fence position` -- the
  mutation and README 1's are the two sides of that equivalence, which is why the
  same title is the witness for both.
- `BUNDLE 5`'s description says "the two-build reproducibility test" and the title
  is `pins every tar field that could vary between machines`.

The first full run afterwards: **24 caught, 0 survived, 0 inert, 0 timed out,
0 unparseable, 0 unattributed, 1 redundant** -- the same verdicts as before the
change, now with a reason for each one.

### Verification

| gate | result |
| --- | --- |
| the battery, on the shipped table | **24 caught / 0 unattributed / 0 unparseable**, 25 injections, 83.8s |
| `--verify-expectations --probe` | **OK (28 witness(es) across 25 injection(s), with the comparator probed)** |
| `gate-test-battery-attribution.test.ts` | **11 tests**, including two that drive `main()` with a one-row table so the wiring is exercised and not only the decision functions |
| mutation of the fix itself | three mutations -- restore the old condition, disable the parse guard, neuter the witness lookup -- each turns the new test file **red**, and the battery is **byte-identical** afterwards |
| governance guards | `batteries-reach-an-invoker`, `batteries-verify-their-restore`, `cold-tree-job`, `scripts-are-classified`, `gate-sites-are-proven`, `export-surface-enumerated`, `timeout-budget`, `ci-reaches-doc-guards`: **274 passed** |
| `gate-sites.json` | unchanged: 49 sites, all `proved` |
| core test suite | **132 files, 3444 tests passed**; `cli` 3 files, 173 tests |
| coverage | **99.96 / 99.91 / 100 / 99.96**; `cli` **100 / 100 / 100 / 100** |

The `UNPARSEABLE` end-to-end test asserts that the stub for `run_tests` is **never
called** -- it raises if it is. That is the difference between testing the
condition and testing the order the condition is asked in, and the order is what
makes the guard hold.

### What is not covered

- **The witnesses pin one substring per test, not the assertion inside it.** A
  mutation that breaks a test *by* an unrelated assertion inside the same test
  body is attributed correctly, because attribution is at test granularity. That
  is the granularity the runner reports at, and no finer one is available.
- **The other twelve batteries.** Three of them compare a declared expectation
  with the output (`doc-counts-shapes`, `backend-support`, `roundtrip-record`);
  the remaining four decide on `failed > 0` alone
  (`fault-extraction-scoring`, `fault-extraction-workflow`, `fetch-official-retry`,
  and the probes are a different shape). Finding 156 recorded this as a residual;
  it is still one, and it is now the largest single gap in the verification story.

### What this says about the method

The battery has persisted the failing test names of every injection for as long as
it has existed, and the claim they could check was written in prose one field to
the left. Nothing was missing except the comparison -- which is the same sentence
this campaign has written about a mislabelled row (153), a log-line measurement
(155), and a score that was not an artefact (156). **A claim and its evidence
sitting in the same record, unconnected, is the most common shape of the defect
found here**, and the remedy is always to make something compare them.

---

## Finding 158 — three more batteries answered "the suite went red" to a question about a specific test

### What was measured

Finding 157 fixed `gate-tests-battery.py` and recorded the residual in one
sentence: *the remaining batteries decide on `failed > 0` alone*. This round
measured that residual.

| battery | injections | verdict condition | claim compared with the failure |
| --- | --- | --- | --- |
| `gate-tests-battery` | 25 | witnesses (finding 157) | yes |
| `fault-extraction-scoring` | **12** | `failed > 0` | **no** |
| `fault-extraction-workflow` | **9** | `failed > 0` | **no** |
| `fetch-official-retry` | **5** | `failed > 0` | **no** |

Twenty-six injections, and not one of them was credited only if the test it
describes is the test that disagreed. `fault-extraction-scoring` even returned the
runner's **output** from `run_suite` -- and used it only to parse a count.

### What was built

**One implementation, four users.** `scripts/injection/_witnesses.py` owns the
reader (`failing_tests`, `transform_failure`, `strip_ansi`), the decision
(`attribute`), and the table check (`witness_problems`,
`verify_witness_table`). The four batteries import it and alias the names.

Four copies of a condition is four places for the next one to drift, and the drift
in this area is why the module exists. `gate-tests-battery.py` was migrated too,
so there is now **one** implementation rather than one plus three: a battery that
stopped delegating fails `battery-witnesses.test.ts`, which asserts the call sites
by counting them.

Each of the three batteries gained an `EXPECTATIONS` table and
`--verify-expectations --probe`, the same two reconciliations as finding 157:
`INJECTIONS` and `EXPECTATIONS` must agree in both directions, and every witness
must appear as a title in the file its row runs.

### The second discriminator, and why it is a measurement

The demonstrated hole in finding 157 was a mutation that leaves the file
unparseable. For TypeScript there is no `node --check`: `esbuild` is not on this
machine's path and `tsc` reports module-resolution errors that are not parse
errors. So the shape was **measured** instead of assumed, by appending
`const broken: number = ;` to the scorer's source and reading what the runner
printed:

```
exit: 1
  Transform failed     1  ['Error: Transform failed with 1 error:']
  Tests                1  ['Tests  no tests']
  Test Files           1  ['Test Files  1 failed (1)']
```

`Transform failed` and `Tests  no tests` are the discriminator, and they are
format-agnostic -- the runner prints them for `.mjs` as well, which is why
`attribute` consults them **before** the witnesses. The order is the substance:
when a file cannot be transformed, the declared witness *is* among the failures, so
a witness check alone cannot see this case.

### The witnesses were wrong six times, and that is the mechanism working

Twenty-six witnesses were authored from each row's description and reconciled
against the test file's source, then verified by running each battery. Six were
wrong, and the first run said so:

```
fault-extraction-scoring   UNATTRIBUTED  the sample-id pairing check removed
                             missing: refuses to score a run whose predictions do not cover the samples
fault-extraction-scoring   UNATTRIBUTED  an empty dataset accepted
                             missing: rejects a missing samples array
fetch-official-retry       UNATTRIBUTED  the digest comparison always agrees
                             missing: retries when the download succeeded but the bytes are wrong
```

Each was repaired by reading what the mutation actually breaks, not by relaxing
the check: `reports a mismatched sample id as a hard error rather than scoring it`,
`names the duplicated sample id rather than averaging over it twice`,
`reports an empty dataset as an error, because an empty run measures nothing`,
`does not retry a same-length digest mismatch, and reports it as a pin problem`.
One of those corrections was itself a typo -- `pin mismatch` for `pin problem` --
which the source reconciliation caught before the battery ran.

That is the finding in miniature: **the guess was cheap and the check was what made
it worth anything.** A table filled from the previous run's observations would have
been right on the first try and worthless, because it would have pinned whatever
the run happened to do.

### A regression this round introduced, and the probe that caught it

The patch that inserted `verify_expectations` and the expectation table into
`fault-extraction-workflow.py` placed them **after** `def main() -> int:`, so the
original body of `main` became dead code behind `return reconcile`, and the battery
ran its reconciliation and **nothing else**:

```
$ python3 scripts/injection/fault-extraction-workflow.py
fault-extraction-workflow: OK (9 witness(es) across 9 injection(s))
$ echo $?
0
```

A battery that silently stops running its injections and exits 0 is the worst
shape of defect in this area -- and the reconciliation line, which is what the new
mode prints first, made the output look healthy. It was caught by running the
battery and noticing that a 9-injection run finished instantly. The repair moved the
body back under its own `def main`, and the run now prints its nine rows.

### Verification

| gate | result |
| --- | --- |
| `gate-tests-battery` | **24 caught / 0 unattributed / 0 unparseable**, 25 injections |
| `fault-extraction-scoring` | **12 caught**, was 12 credited by `failed > 0` |
| `fetch-official-retry` | **5 caught** |
| `fault-extraction-workflow` | **9 caught**, pristine negative control green |
| `--verify-expectations --probe` on all four | **OK** (28 + 12 + 5 + 9 witnesses, comparator probed) |
| `battery-witnesses.test.ts` | **13 tests**, including the ordering of the transform check and the claim that there is one implementation |
| tests that pinned the old shape | six assertions across four files failed on the change and were repointed -- the extraction helper now reads the shared module for the names that moved, and carries the module constants the function needs |
| `typecheck` / `lint` / `docs:check` / coverage | green; coverage core **99.96 / 99.91 / 100 / 99.96** |
| core test suite | **133 files, 3458 tests passed**; `cli` 3 files, 173 tests |

### What is not covered

- **The probes** (`m1-ceiling-probe.py`, `scorer-stability-probe.py`,
  `type-miss-probe.py`) are a different shape: they measure a quantity rather than
  break a gate, so there is no verdict to attribute. Finding 156's residual is now
  three batteries smaller and has these three left in a form that has to be
  described rather than converted.
- **Attribution is at test granularity.** A mutation that breaks a test *by* an
  unrelated assertion inside the same test body is credited correctly.

### What this says about the method

Finding 157 ended by naming the residual in one sentence, and this round was that
sentence, executed. The three batteries had the failing test names in hand -- one
of them returned the whole output from its runner -- and compared none of them with
the claim one field away. **The claim and its evidence, in the same record,
unconnected**: the same sentence this campaign has written about a mislabelled row
(153), a log-line measurement (155), a score that was not an artefact (156), and a
battery that accepted any red (157).

---

## Finding 159 — two residuals whose subject no longer existed, and a list that now has a reader

### What was measured

Finding 158 closed by naming three probes as "a different shape". This round checked
that, and they are: `m1-ceiling-probe.py` and `type-miss-probe.py` carry a
`requirement(report) -> bool` per row -- the verdict is a property of the probe's
output, not "the suite went red" -- and `m1` even declares `crash_contains`, the text
its failure must carry, so a probe that dies on a typo is not credited. Nothing to
fix there. So the round went to the item the roadmap had carried the longest, and
found that **it had no subject left**.

### Residual one: the `commits` count gate

The roadmap's P2-4 has said, since v1.74:

> **Remaining**: the same gate for the `commits` count is not done

and its stated motivation is finding 3: *"`progress.md`'s commits count went stale
from 79 to 85"*. Measured now, in both repositories:

```
$ grep -rE "[0-9]+ (commit|commits)\b" docs/*.md
docs/audit.md:11157 ... the v1.54 commit as `HEAD` ...
docs/audit.md:14873 commit 5ed956747
docs/audit.md:15314 189 commits of the repository finds no revision ...
$ grep -rE "[0-9]+ *(次提交|个提交|提交数)" ../rca-bench-factory-docs/*.md
(nothing)
```

**No document publishes a count of commits.** The number the item was motivated by
was removed at some point -- correctly, since it was the stale one -- and the item
stayed on the list because nothing re-measures an item whose subject has gone. A gate
cannot be written for a claim that is not made, so the item is closed with this
measurement rather than implemented.

### Residual two: six scripts observed failing in run #174

`docs/progress.md`'s Open list carried:

> The six other scripts that failed in run #174 were never examined individually.

and the audit says of them: *"the exposure is gone ... but the individual readings
were never taken and the count stands as the evidence."* Both halves were checked:

| claim | measurement |
| --- | --- |
| the job no longer runs a suite, so the exposure is gone | `docs:check:cold` and `lint:cold` are the job's members, and both **exit 0 with `packages/core/dist` moved aside** |
| the individual readings | no longer obtainable: that run's log has aged out of the API |

So the count is retired rather than carried. The entry now says so, with the
measurement beside it, instead of standing as evidence for a claim nothing can
re-check.

### The pattern, three times, and the fix

| entry | how it had stopped meaning anything | found by |
| --- | --- | --- |
| `--stdin` has no automatic invoker | closed **eleven passes** earlier by finding 150 | finding 150 |
| the `commits` count gate is still to be done | **no such count is published anywhere** | finding 159 |
| six scripts in run #174 were never read | the job that ran them no longer runs a suite | finding 159 |

Finding 150's correction says the thing precisely and did not act on it: *"The line
stood for eleven passes after that, because nothing reads an 'open' list."*

`scripts/check-open-list.mjs` gives the list a reader. It locates the section **by
its heading** (finding 155's bug was a guard that accepted any line mentioning the
section), and requires every entry to say **which it is**:

- **closed** -- struck through, naming the finding that closed it, so a reader can
  tell history from work;
- **open** -- carrying `[open: <reason>]`, with the reason required to be longer than
  a placeholder and not shared with another entry.

The section is now five entries: **three open with a reason, two closed by a
finding**. The header paragraph the guard needs is part of the section, so the format
is stated where a reader of the list will see it.

**What it cannot do** is check whether an entry is still *true* -- that needs the
measurement the entry is about, and a script cannot guess it. The guard's header says
so, and refuses placeholders instead: the same trade finding 153 made for its
exemption table, and the same honest limit.

### Verification

| gate | result |
| --- | --- |
| `check-open-list.mjs` on the shipped document | **OK** (5 entries: 3 open with a reason, 2 closed by a finding) |
| `check-open-list.test.ts` | **7 tests**: neither-marker, short reason, shared reason, closure accepted, sentence accepted, the shipped file judged by the same predicates, and the site declared |
| cold-tree measurement | `check-open-list.mjs` exits 0 with `packages/core/dist` moved aside -- measured before it was added to `docs:check:cold`, the way every member is |
| the guards the change tripped | rule 7 of `gate-sites.json` refused the new test because it spawned the guard without declaring it; the site derivation refused a computed exit, so the failure path is now a literal `process.exit(1)`; `cold-tree-job.test.ts` refused the unmeasured membership |
| `docs:check` / `docs:check:cold` / `typecheck` / `lint` | green; 50 sites, all `proved` |
| coverage | core **99.96 / 99.91 / 100 / 99.96** |
| core test suite | **134 files, 3465 tests passed**; `cli` 3 files, 173 tests |

### What is not covered

- **Truth, not form.** The guard refuses an entry that does not say which it is; it
  cannot refuse a closed entry that was closed wrongly, or an open one that has since
  become closed. Both need the measurement the entry names.
- **Other lists.** The roadmap's own priority table in the docs repository has the
  same shape and is not gated -- that repository has no CI of its own, which is the
  asymmetry finding 112 recorded.

### What this says about the method

Three residuals, three times the same failure: **a list that is written once and read
never**. The campaign's usual sentence is about a claim and its evidence sitting in
the same record unconnected; this is one step further on -- the claim is a *plan*, the
evidence would be a measurement nobody was asked to take, and the list itself had no
reader to notice. The fix is the smallest one that changes that: make every entry say
which it is, so that the next person to open the list is reading decisions rather
than archaeology.

---
