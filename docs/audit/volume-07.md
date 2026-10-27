## Finding 267 — the layout we wrote is not the layout the loader reads

Finding 266 ended with a sentence it could not act on: *upstream's `main.py` locates cases by globbing
for `data.csv`, and we emit `metrics.json`*. This round reads the rest of that file, and the sentence
was the smaller half of the defect.

### What the loader does, in its own lines

```python
data_paths = list(glob.glob(os.path.join(dataset, "**/data.csv"), recursive=True))
if not data_paths:
    data_paths = list(glob.glob(os.path.join(dataset, "**/simple_metrics.csv"), recursive=True))
...
data_dir  = dirname(data_path)
service, metric = basename(dirname(dirname(data_path))).split("_")
case      = basename(dirname(data_path))
...
data      = pd.read_csv(data_path)
time_col  = data["time"]
...
with open(join(data_dir, "inject_time.txt")) as f:
    inject_time = int(f.readlines()[0].strip()) + args.tdelta
normal_df = data[data["time"] < inject_time].tail(...)
anomal_df = data[data["time"] >= inject_time].head(...)
...
"service": len({c.split("_")[0].replace("-db", "") for c in _pre_cols if c != "time"}),
```

Four requirements, and every one of them is about the **file**, not the metric formula:

| requirement | what satisfies it | what we wrote |
| --- | --- | --- |
| the case is found by a recursive glob for `data.csv` | a file with that name | `metrics.json` — never matched |
| the answer key is `basename(dirname(dirname(path))).split("_")` | three levels, middle one `{service}_{fault}` | one level: `RE2-order-cpu_1/` |
| the `time` column is compared against `inject_time.txt` | a numeric column in Unix seconds | no column; a `{name: [values]}` mapping |
| candidate services come from `c.split("_")[0]` | columns named `<service>_<metric>` | metric names with no service in them |

The second is the one that would have raised rather than silently mis-scored: for a flat directory,
`dirname(dirname("dataset/RE2-order-cpu_1/data.csv"))` is `dataset`, whose `split("_")` has one element
and cannot unpack into two names.

### Why 500+ passing cases said nothing about it

`oracle=1.00` over RE1's 375 and RE2's 270 came from `runAllOfficialRegressions`, which applies the
published **metric**: it reads the case's directory name, recovers the ground truth, and scores the
submission. The metric never opens `data.csv` and never asks how a case is found. So the export could
be shaped entirely differently from what the loader reads and score 1.00, and it did — for four rounds.

Our own scorer also had a second parser for our own shape (`parseRcaEvalDirectory`, the flat
`{suite}-{service}-{fault}_{n}`), so both halves of *our* loop agreed. Two parsers, one author: the
corpus's shape and ours, each read by the code that wrote it.

### What it is now

**The path** is produced by `casePath` and is three levels:

```
RE2-order-prod/order_cpu/1/data.csv
 └ suite-system  └ {service}_{fault}  └ instance
```

`{system}` is free-form to upstream — it only walks through it — so it carries the case's own system
token, and `parseRcaEvalPath` reads it back. That parser's pattern for the head widened from
`[A-Za-z0-9]+` to `[A-Za-z0-9-]+` in the same change, because "free-form" and "no hyphens" cannot both
be true and the corpus's own tokens (`RE2-SS` is fine, `sock-shop` is not) are the reason to widen
rather than to sanitise.

**The metric table** is `data.csv`, wide, produced by `buildDataCsv`:

```csv
time,order_cpu_usage
1788653400,20
1788653430,21
```

`time` is the union of the series' instants in Unix seconds, one column per series named
`<service>_<metric>`, and a series with no sample at an instant leaves that cell **empty** — `main.py`
calls `ffill()` then `fillna(0)`, so a gap is something it handles, while a zero would be a reading
this exporter invented.

**`metrics.json` is gone.** It carried the same numbers in a shape nothing reads: no `time` column to
compare, no service in a name, and a file name the glob never matches. Keeping it beside `data.csv`
would have been two sources for one fact, which is the shape every finding in this volume is about.

**The structure check follows.** `metrics-json` became three rules, each with its own name and its own
refusal:

| rule | asserts |
| --- | --- |
| `data-csv` | a table exists |
| `data-csv-header` | its first column is `time` |
| `data-csv-time` | its first instant is on the **injection time's clock** (within a year) |

The third is the one that needed thought. "Ten digits" would have been a guess about the era; what
`main.py` actually does is compare the two numbers, so a table whose instants count from zero puts
every sample on one side of the boundary and the window comes out empty rather than wrong. That is a
property of the pair, and it is asserted as one.

### What the change broke, and what that says

Twenty-four tests went red, and they were of four kinds. Three were mechanical (a path is one segment
longer). One was a *fixture telling the truth about itself*: `check-official-roundtrip.test.ts` wrote
`time,cpu_usage\n0,0.2\n1,0.95\n` for a case whose `inject_time.txt` is `1700000000` — a table counting
from zero beside an injection time in 2023, which the new rule refuses, correctly. The fixture had been
fine for as long as nothing compared the two.

One was a counter: `check-fault-cases.mjs` reported "1 case(s) written" for thirteen annotated cases,
because it counted the directories directly under the export root and every case now shares one
`RE2-{system}`. It counts leaf directories now.

And one was a claim the corpora deny, for the second round running:
`target-requirements.test.ts` asserted that *every* target scores identically with *any* modality
removed. That was true while the metric file was a mapping — `{}` is still a file — and it is false now
that the metric table is required to have a `time` column and a row. The test kept its point (the score
is not where a requirement can be derived from) and lost its overreach: it removes `log`, `trace`,
`event` and `alert`, and a second test states the metric exception with its reason.

### What this does not do

**It does not make upstream's baselines run on our data, and the remaining blocker is a lookup table.**
`process()` chooses the SLI it ranks by matching the *path* against a fixed list:

```python
elif "online-boutique" in data_path or ... or "RE2-OB" in data_path or "RE3-OB" in data_path:
    sli = "frontend_latency"
    if f"{service}_latency" in data: sli = f"{service}_latency"
...
else:
    raise ValueError("SLI not implemented")
```

So a case exported as `RE2-order-prod/...` is loadable and scorable by our own reproduction of the
metric, and `main.py` would raise on it before ranking anything. Making that work needs either the
corpus's own system tokens (which only fit the corpus) or a mapping and a `_latency` series in the IR —
a decision about what an exporter is allowed to claim, not a repair. It is recorded here rather than
guessed at in code.

**It does not measure RE1's `data.csv`.** The format we now emit is the one finding 120 measured out of
RE1-TT (`time` plus `<service>_<istio-*>` columns), and the columns match by name convention rather
than by comparison with a file this round opened. RE1's archive has not been downloaded here.

**It does not emit the corpus's aggregate tables.** `logts.csv`, `tracets_err.csv` and
`tracets_lat.csv` are read by the multi-source methods (`mmbaro`, `mmnsigma`, `mmrcd`, `mmcirca`) and
by `torai`; nothing in this repository produces them, so those methods cannot run on our export even
with the SLI question settled.

**It does not change what the round trip scores.** The anchor still applies the metric; the shape
contract is checked beside it (finding 266). Both now agree about the layout, which is the first time
they could.

### Acceptance

| gate | result |
| --- | --- |
| the path | three levels; `parseRcaEvalPath` round-trips system, service, fault and instance |
| the table | `time` first, one column per `<service>_<metric>`, empty where a series has no sample |
| the clock | `data-csv-time` compares the table's first instant to `inject_time.txt`, not to a digit count |
| the removals | `metrics.json` and `buildMetricsJson` deleted; `caseDirName` deleted; `parseRcaEvalDirectory` remains only as a reader for shapes this repository no longer writes |
| the tests | 5 new refusal tests, **all 5 red against a mutation that disables the three rules** (measured, then reverted); 24 updated; the whole suite green at core **187 / 4664**, cli 4 / 187, repo **191 / 4851** |
| the golden anchor | `rcaevalRe2Files` re-anchored: four files under `RE2-order-prod/order_cpu/1/` |
| the inventory | 88 failure sites across 46 scripts, annotations carried |
| the documents | `docs/targets/rcaeval.md` regenerated from the spec, plus the prose that described `metrics.json` |

## Finding 268 — the code-level slice was refused by the gate that selects it

The fourth anchor's third corpus is 90 cases across three systems, and it took two dispatches to get
a score out of it. The first one is the interesting failure:

```
ROUNDTRIP declared 90 case(s), found 539 file(s), 122 directory(ies)
ROUNDTRIP PASS  84/90 …
ROUNDTRIP FAIL  85/90 RE3-TT/ts-route-service_f3_1/1  reason=simple_metrics.csv names 68 entities
                in its columns (ts-admin…) and none of them is 'ts-route-service_f3'
…
ROUNDTRIP report …: 87 scored, 0 skipped, 3 failed
```

Two defects, found two different ways.

### The gate that could not be satisfied

`exportRcaEval` admits an RE3 case only when `fault.category === 'code'`, which is the target's own
rule and correct: RE3 *is* the code-level slice. The corpus states its faults as `f1` … `f5` —
**indices into a taxonomy, not categories** — so the category has to come from somewhere, and
`inferFaultCategory('f1')` returns `unknown`, correctly: the token carries no keyword.

Nothing supplied it. So had the parse been right, the run would have reported `90 skipped`, and
`ROUNDTRIP PASSED` would have printed over a slice in which no case was examined. **A target declining
a fault class and a reader that never told it the class look identical from the outside**, and only one
of them is fine.

The fix is one field: `PrimeCaseSource.faultCategory`, which `parseFaultSpec` treats as authoritative
when present. `check-official.mjs` states it for the corpus it reads, because an `RE3-*` directory *is*
the code-level slice — the suite name is the only place the corpus says so. The default is unchanged,
so every other descriptor behaves as it did.

The refusal message changed with it. It was the constant `case '…' is missing the fault type`, which now
would describe a misspelled category as an absent type; it carries `parseFaultSpec`'s own sentence.

### The split, which was on the wrong side

`ts-route-service_f3_1/1` is one directory out of ninety, and it is the only one in the corpus whose
`{service}_{fault}` segment has two underscores. `parseRcaEvalPath` split at the **last** one:

```
ts-route-service_f3_1   →   service = 'ts-route-service_f3',  fault = '1'
```

`ts-route-service_f3` exists nowhere. The service is `ts-route-service` and the fault is `f3_1` — a
label the corpus distinguishes from `f3`, which it also ships. The failure surfaced three times, in the
adapter's "the table does not name the component" message, which is a message about the *data*.

Measured, before choosing the other side: of the 90 case directories, every service token is hyphenated
(`adservice`, `frontend-external`, `ts-route-service`) and **none contains an underscore**, while exactly
one fault label does. So the split is at the first underscore, and the direction is a measurement rather
than a preference.

The test that pinned the old rule argued from an assumption: *"service names routinely contain
underscores of their own"*. That sentence was never measured, and the corpus denies it. Its companion
claim — that RE2's fault vocabulary is six single tokens — was true of RE2 and false of RE3, which the
test could not see because it only ever looked at RE2. **A rule derived from one corpus, asserted about
the format.**

Two consequences on the write side, both in the same change:

- `casePath` keeps underscores in the **fault** token and strips them from the service. The sanitiser
  wrote `f31` for `f3_1` — a third label, silently, and the label is the answer key.
- `parseRcaEvalDirectory`'s docstring said it is "the one our exporter writes". That stopped being true
  in finding 267; it is a reader for a shape this repository no longer writes.

### One case upstream cannot read at all

`main.py` splits with `service, metric = basename(dirname(dirname(data_path))).split("_")`, which
unpacks into exactly two names and raises on three. So the published loader cannot read
`ts-route-service_f3_1` either — this repository's parser is now deliberately **one case more capable
than the loader it reproduces**, and that is written at the parser rather than discovered later.

### The readout

```
01:06:32  dispatch 40430588523 at ecec7f581
01:10:49  REPORT  pins.json: 5 pin(s) measured
01:10:49  ROUNDTRIP declared 90 case(s), found 539 file(s), 122 directory(ies)
01:11:08  ROUNDTRIP context 90 case(s) carried other entities in their table; 13460 column(s) …
01:11:08  ROUNDTRIP report …: 90 scored, 0 skipped, 0 failed
01:11:08  ROUNDTRIP PASSED (90 case(s) round-tripped through the official layout)
```

With 375 from RE1 and 270 from RE2 that is **735 cases across three corpora**, every one at
`oracle=1.00`, and every asset in the registry pinned by a measurement the workflow itself took.

### What this does not do

It does not make upstream's baselines rank our data. That is still the SLI table (finding 267): the
metric is loadable and scorable by this repository's reproduction of it, and `main.py` still raises
`SLI not implemented` for a system token it does not recognise.

It does not read RE3's traces or logs, which are the largest files in these archives (29 MB and 11 MB
per case) and which the adapter never opens. The export writes the corpus's columns for them; nothing
fills them from a corpus (finding 264's limitation, unchanged).

It does not measure what the five assets contain beyond their digests. `rcaeval-multi-source` extracts
to a directory of its own and contributes no cases — 90 declared, and 90 is the whole slice.

### Acceptance

| gate | result |
| --- | --- |
| the category | `PrimeCaseSource.faultCategory`; 3 tests, one of them the vocabulary refusal by name |
| the split | first underscore; 2 tests including the corpus's own `ts-route-service_f3_1/1` |
| the write side | fault token keeps `_`, service token strips it; 2 tests |
| the run | **90 of 90 at `oracle=1.00`**, 0 skipped, 0 failed, 5 pins measured and agreeing |
| the anchors | RE1 375 + RE2 270 + RE3 90 = **735 cases**, all at `oracle=1.00` |
| the tests | 8 new (3 prime, 2 parse, 2 export, 1 round-trip over a synthetic RE3 corpus) |
| `core` / repo | **187 / 4671** · **191 / 4858**; coverage unchanged |

## Finding 269 — the suite that could not start once the last asset was pinned

The commit that recorded RE3's five pins went red in CI, on a file that never ran locally:

```
FAIL  test/check-l4-status.test.ts [ test/check-l4-status.test.ts ]
Error: this file needs at least one pending target to test the guard's rules, and the registry
       currently has none
      Tests  1 failed | 4657 passed (4658)
```

and next to it, one assertion:

```
FAIL  test/official-assets.test.ts > … > names every pending asset, so the state is a list and not a residue
AssertionError: expected 0 to be greater than 0
```

Both are the same fact: **every fetchable asset in the registry now has a measured digest**, and two
pieces of the suite had been written to need one that does not.

### Two shapes of the same mistake

`check-l4-status.test.ts` derived its fixtures from the live registry and then **threw at module load**
if any of the three states was empty. The reason was sound — a mutation test for "a pending row called
pinned" needs a pending row, and a test with no subject passes vacuously — but the conclusion bound the
suite to the data. Four rounds of pinning assets ran it down to zero, and the round that pinned the last
one made the file unloadable.

`official-assets.test.ts` asserted `pending.length > 0` for the same anti-vacuity reason. Its subject
was really "a pending asset is *named*, and pending is disjoint from unfetchable"; the non-empty
guard turned that into a claim about which assets exist.

**A guard whose fixture is the production data expires when the production data succeeds.** That is the
same shape as finding 265's row count and finding 150's compile-time constant: the check was right
about the rule and wrong about where its example comes from.

### What changed

`check-l4-status.mjs` takes `--registry`, for the same reason it already took `--table`: the guard's
rules have to be exercisable without depending on what the committed data happens to contain. The
suite builds the state it needs — a copy of the registry with one anchor's digests nulled, which *is*
the registry's own definition of `pending` ("fetchable, no measured digest yet") rather than an
imitation of it — and runs the two pending rules against that copy.

`official-assets.test.ts` states the emptiness instead of requiring fullness:
`expect(pending).toEqual([])` with the reason in the comment, and the naming loop kept, so a future
unpinned asset fails on the round that adds it rather than being noticed later.

### How it was found, and what that says about the round

CI found it. Locally the whole suite was run **before** the registry was pinned and not after; the
pins, the record entry and the published table were then written and only `docs:check` was re-run. So
the last command of the round was a green one that did not cover the change.

That is the third time in this volume that a check existed and was not run against the thing it
governs — finding 265's battery row, finding 266's structure check on real data, and this. The
difference here is that the cost was one red CI run rather than a wrong measurement: `pnpm test`
after the pin would have caught it, and the habit it argues for is that **a change to a data file the
suite reads is a change to the suite's inputs, and the suite is what has to be re-run.**

### What this does not do

It does not make the registry unable to reach zero pending assets again — that is the desired state,
and the two rewritten tests now accept it.

It does not add a `pending` fixture to any other test file. `check-l4-status.test.ts` was the only one
that could not load; a search for other live-data premises is worth doing and is not this change.

### Acceptance

| gate | result |
| --- | --- |
| `--registry` | one flag, defaulting to the committed path; the guard's output is unchanged |
| the fixtures | `pendingRegistry()` nulls one anchor's digests; `rowsWithPending()` builds the table that agrees with it |
| the two rules | still two-sided: pending-called-pinned and pending-claiming-a-reading, both red |
| the naming rule | kept, with the emptiness asserted rather than required |
| `core` / repo | **187 / 4671** · **191 / 4858**; 4671 locally after the pin, which is the run that was missing |

## Finding 270 — a relation names a direction, and the graph accepted either one

Finding 269 ended with a list, and the last item on it was one sentence: *no relation is checked for
direction*. This round is that sentence.

### The check the two existing checks are not

`ir/types.ts` describes four of its five relations as a movement from one thing to another:

```
contains  a service has a pod, a pod has a container -- part-of, inside
hosts     a node runs a pod -- where it lives
calls     one service invokes another, or a service uses a datastore or a broker
routes    traffic for the target passes through the source -- a router, a switch, a load balancer
```

The graph validated three things about an edge and never that one. `findDanglingEdgeRefs` asks
whether both ends exist. `findInvalidRelations` asks whether the word is in the published tuple.
`assessFourLayer` asks whether the ground truth's references resolve. None of the three reads
`from` and `to` as an order rather than as two names.

So the sentence is exact, and its cost is not cosmetic. A `calls` edge written backwards moves the
root cause from the caller to the callee — which is the answer an evaluator compares against, and the
one a reader of the exported topology uses to decide what is upstream.

### Measured before it was believed

The claim was tested on a copy of the corpus rather than argued from the code:

```
cp -r golden-master/fault-cases /tmp/fcc
# flip service:checkout-api --contains--> pod:checkout-api-0
node scripts/check-fault-cases.mjs --cases /tmp/fcc
```

Green. Four-layer annotation, reference resolution, G1, G2, G5, the RCAEval export for all three
suites, and the checkpoint assertions — every one passed, on a topology whose containment pointed the
wrong way. Flipping `service:checkout-api --calls--> payment-service` instead was green too, and that
one is the defect that changes an answer.

### Two of them were already in the tree

This is not a hole nobody had stepped in. With the rule written, the suite went red on two fixtures
the repository had carried for as long as each had existed:

- `entity.test.ts` — `pod:default/order-7d9f --contains--> service:default/order`, the pod containing
  the service whose replica it is.
- `rca100.test.ts` — `pod:default/order-pod-1 --hosts--> service:default/order`, a pod hosting the
  service.

Both were written by the author of the guard that now refuses them, and both had a passing test
attached. That is the shape this volume keeps recording: a fixture that is wrong in a way its test
cannot see, because the test asks a different question than the one the fixture's own words claim.

### The rule, and why the table is hand-written

`RELATION_SIDES` in `entity/graph.ts` states, per relation, which entity kinds it admits on each
side. `contains` takes a `cluster` / `node` / `host` / `service` / `pod` and produces a `pod` /
`container`; `hosts` takes a `cluster` / `node` / `host`; `calls` takes a caller and produces a
`service` / `external` / `db` / `mq`; `routes` takes the device traffic passes through; `same_as` is
`null`, because identity is symmetric in `normalizeAliases` and inventing a side would refuse half the
edges that are correct.

The rows are written by hand for the reason `export-surface-enumerated.test.ts` gives about its own
list: a table derived from the corpus agrees with the corpus by construction, including where the
corpus is wrong. The price is a refusal that says which kinds were admitted, so a new directed shape
is one line away rather than a silent pass.

`findImplausibleEdgeDirections` also refuses an edge from an entity to itself. A kind-pair table
cannot: `pod --contains--> pod` has a legal source kind and a legal target kind and means nothing, and
the same is true of `service --calls--> service`.

### What the rule cannot do, stated where the rule lives

**A kind pair cannot catch a reversal between two entities of one kind.** `service A --calls-->
service B` and `service B --calls--> service A` are both admitted. The direction of a call is a fact
about a deployment, not about kinds, and this is measured rather than assumed: the flipped-`calls`
experiment above is still green after the rule landed, and it is recorded as green.

Closing it needs an independent witness — a trace whose parent-child spans say which service called
which — and the corpus has exactly one case that carries traces at all. That is a corpus problem
before it is a code problem, and it goes on the open list rather than into this table.

### The half that is not a rule: G2 was two questions in one function

Turning the rule on produced **26 problem lines for one reversed edge**. `checkG2Semantic` was one
function over a bundle, and `check-fault-cases.mjs` asks it of a one-case bundle twice — once before
the telemetry is expanded, once after. Thirteen cases times two passes, each reporting the same graph
defect.

Two things were wrong and they are separate:

1. **The graph's obligations are the graph's.** They do not depend on which case is being read, so a
   caller with thirteen cases over one topology should ask once. `checkGraphContract(graph)` is now
   that question, `checkCaseSemantics(bundle)` is the other, and `checkG2Semantic` composes them in
   that order — graph defects first, because one is repaired for every case that ships the graph.
2. **The second pass could not have differed.** G2 reads the graph and the ground truth; it never
   reads telemetry. Asking it of `withSignals` was a second run of a pure function over the same
   inputs, and it was kept because the surrounding block was about signals. It is gone, with the
   reason in its place.

`check-fault-cases.mjs` now keys the graph contract on the graph *file name* rather than on
`firstGraph`, so a corpus that grows a second topology checks both.

### The guard's own guard had the same shape

`guard.test.ts` extracts G2's `code:` literals from `gates.ts` by slicing the body of a function it
finds by name. After the split, `checkG2Semantic`'s body contains two calls and no codes, and the
extractor returned an empty set — `finds codes to classify at all`, the positive control written for
exactly this failure, went red.

The fix keeps the control honest: `G2_PARTS` names the functions G2 is made of, and a second
assertion reads the composer's body and requires it to call each of them. A third half added later
without being listed fails there rather than quietly emitting codes no classification covers.

`STRUCTURAL_CODES` in `export/guard.ts` gained the two new codes by hand and deliberately. Deriving
that set from `checkGraphContract` would be tighter and would delete the decision the set exists to
force: whether a defect is one the whole bundle must be refused for, or one a case can be skipped
for. The two new ones are structural for the same reason `DANGLING_EDGE_REF` is — the graph is
shared by every case in the bundle, so no per-case skip repairs it.

### Mutation battery

| mutation | expected | observed |
|---|---|---|
| `contains.to` admits `service` | the reversed-containment test fails | 1 failed / 12 |
| the self-edge branch is deleted | both self-edge tests fail | 2 failed / 37 |
| `checkG2Semantic` stops composing the graph half | the composition tests fail | 2 failed / 24 |

Each restored afterwards, and the restored tree is what the acceptance table below was measured on.

### Acceptance

| gate | result |
| --- | --- |
| the rule | `RELATION_SIDES` covers all five relations, and only published kinds appear in it (two tests) |
| the corpus | 19 directed edges, 0 refusals; the 13 cases still pass G1, G2 and G5 |
| the negative control | flipping one `contains` edge → `FAILED — 1 problem(s) across 13 case(s)` |
| the known gap | flipping one `calls` edge → still `OK`, stated in the finding and on the open list |
| the report | one graph defect is one line, not twenty-six |
| the export boundary | both codes are structural, so `assertExportableBundle` refuses the bundle |
| `core` / repo | **188 / 4690** · **192 / 4877** |
