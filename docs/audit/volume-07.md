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

## Finding 271 — the corpus grew to fourteen, and its guards were measuring the corpus by heart

The fourteenth case is `resource-ephemeral-capacity-image-builder`, annotated from
`resource-ephemeral-capacity-image-builder`. It is the corpus's first whose answer is a *filesystem
boundary* rather than a component:

```
The image builder began failing every build with 'no space left on device' while df
reported 40 percent used. The writable overlay had hit its 10Gi ephemeral limit ...
```

Both readings are true. `df` reports the node's root filesystem; the failure is in the pod's writable
overlay, one layer in. A corpus carrying only the full series would be satisfied by *the node is out
of disk*, which is false; one carrying only the healthy series would report nothing wrong. So the
case's evidence is the pair, and its control is the reading that sent the first responder to the
wrong filesystem.

Three entities and two edges were added to the graph for it — `image-builder`, its pod, the node the
pod runs on — taking the corpus to **14 of 30**, 34 entities and 21 directed edges.

### What broke when it landed

Seven assertions, in two files, and every one of them was the same defect in a different place: the
guard's own tests had written down what the corpus contained instead of reading it.

| assertion | had been | why it went red |
| --- | --- | --- |
| `13 of 30 sample(s) carry a four-layer case` | literal | the corpus holds fourteen |
| `RE2 13 case(s) written, 19 file(s) with no rows` | literal | fourteen cases write fourteen |
| `RE3 2 case(s) written, 3 file(s) with no rows, 11 skipped` | literal | the count is the number of `code` cases |
| `checkpoints 41 of 41 ... 6 citing a declared configuration fact` | literal | 45 references now |
| `['entity', true, 31]` | literal | the graph holds 34 entities |
| `'  entity    filled 31 item(s)'` | literal | same fact, printed form |
| `0 of 37 comparable assertion(s) fail` | literal | 41 now |

Seven is not seven independent mistakes. It is one mistake the corpus had been small enough to hide:
**a guard whose assertions restate the data goes red when the data changes**, and it reports that
change as a defect in the guard. This volume has recorded the shape twice already — finding 269's
fixture borrowed from production, and finding 255's `sampleId` join that nothing read — and this is
the third form: the number, rather than the file.

### What each became

- **The counts are read.** `CORPUS_SIZE` from `index.json`, `SAMPLE_COUNT` from the extraction key,
  `CODE_LEVEL_CASES` from the case files' own `fault.category`, `graph.entities.length` from the
  graph. A report that disagrees with the index is now the failure, which is the assertion that was
  always meant.
- **The reference summary became an equality.** `checkpoints N of N` is asserted by capturing both
  numbers and requiring them equal, with `N > 0` so an empty corpus cannot satisfy it, and
  `0 of M` with `M > 0` so nothing can be vacuous.
- **The RE2 line became a pattern.** The number written is derived; the `file(s) with no rows` half
  stays a number class, because it counts files whose modality no case supplies, which is a
  property of the corpus's shape rather than of this assertion.

One attempt at this was wrong and is recorded rather than quietly dropped. Having captured the
per-kind breakdown (`34 over a series, 2 of them computed from 4 reading(s), 7 citing a declared
configuration fact`), I asserted that the kinds partition the total. They do not: 34 + 7 is 41, the
total is 45, and the gap is a kind the regex does not capture. The assertion was arithmetic I had
invented about a line I had not read carefully, and the fix is to delete it — the claims that hold
are `resolved === total` and `failed === 0`. Writing a partition rule I could not derive is how a
guard starts reporting its own guess as a defect.

### Two quantities were deleted before they could be checked

The first draft of the case declared `janitorInterval: 24 h` and `queueDepthAtFailure: 31` because
they would have made the story tidy. The incident text states neither: it says the janitor "runs on a
schedule that a long build queue had outrun", and it gives no interval and no depth. The parameters
were removed, and what is left is what a sentence supports — `10Gi` and `/var/lib/buildkit`.

A corpus that invents a plausible number is the thing this project exists to replace, and nothing in
the guard would have caught it: a parameter no checkpoint reads is a parameter no test compares.

### Acceptance

| gate | result |
| --- | --- |
| the corpus | **14 of 30**, 34 entities, 21 edges, floor raised to 14 |
| the new case | four layers complete, 4 checkpoints (one a declared configuration fact), all resolve |
| the derived counts | 7 assertions take their numbers from the index, the key, the case files or the graph |
| the guard | `check-fault-cases: OK (14 of 30 ...)`; `FAILED — 1 problem(s)` on a flipped copy |
| `core` | **188 / 4690**, coverage 99.97 / 99.74 / 100 / 99.97 |

## Finding 272 — a diagnosis withdrawn, and the report that had been counting somebody else's leak

Finding 270 closed with an open item that named a cause: *the batteries in `scripts/injection/`
rewrite a tracked script in place, run the suite, and restore it; a test that reads `scripts/` during
that window sees the mutation as the source.* This round was supposed to fix it. It does not exist,
and the item was wrong.

### What the evidence actually says

The claim had one observation behind it: one whole-suite run went red in
`gates-are-testable-is-enumerated.test.ts` with a listed gate reading as exit-free, and a serial
re-run was green. Three explanations were tested, and the first is the one that had been written down.

**1. Something is writing `scripts/`.** `_restore` is the only writer in `_witnesses.py`, so it was
instrumented to log every write with its target and its stack. A full run produced **60 writes, and
every one of them was under `/tmp`**: `rca-bench-battery-journal-*`, `rca-bench-battery-journal-node-*`,
`rca-tree-repair-*`. None touched the repository. The batteries record whole subtrees but they
*mutate* the temporary roots their tests hand them, which is what `guard(label, roots)` is for.

**2. If not a writer, at least a window.** `scripts/check-doc-counts.mjs` was made read-only
(`chmod 444`) and the whole suite re-run: **green, and not one `EACCES`**, which is what a write
attempt would leave. A process that cannot write a file it is writing to has to fail somewhere.

**3. Two runs at once.** Two concurrent `vitest run` invocations, four workers each: **both green**,
4877 tests each. Three consecutive `test:coverage` runs on the same tree: **all green**. Including the
runs from earlier rounds, that is eight green runs against one red, and the red has not recurred
under any condition that has been tried.

A monitoring script was what produced the original suspicion — it watched `scripts/*.mjs` mtimes and
caught one change during a run. Re-running it with content hashes showed `same_bytes: true`: the
mtime moved and the bytes did not. That is a filesystem artifact of the read that the watcher itself
performed (copy-up on the overlay), not a write. **The instrument was reporting itself.**

So the item is withdrawn. What remains is a failure that happened once, is recorded here with the
three conditions it was not, and is not being called fixed.

### What was real, and what changed

Chasing it did surface one genuine defect, in the same file that had been shouting about it:

```
[typecheck-entrypoint] worktree teardown leaked 8 registration(s): /tmp/rca-bench-typecheck-1sf2UW, ...
```

`cold` is the one worktree `typecheck-entrypoint.test.ts` creates. The teardown removed it — verified
by hand, repeatedly — and then reported every registration in the repository as leaked, because
`registered.filter((path) => path !== ROOT)` subtracts the repository and nothing else. Eight
registrations from earlier runs meant eight complaints after a teardown that had succeeded, and the
same line appeared on every run until they were cleaned. **A message that is the same every run is a
message nobody reads.**

Three changes:

- The report separates `own` from `others`. `others` are named and stated as predating the run, which
  is what they are: leftovers this teardown cannot have caused and should not be blamed for.
- `own` is **asserted**, not printed. `expect({ present: existsSync(cold), registered: ownRegistered })
  .toEqual({ present: false, registered: false })`. A worktree this file created and did not remove is
  a leak that grows with every run, and printing it was not the same as failing on it.
- The assertion lives in `afterAll`, which does **not** make the file's test count red — it prints
  `Tests 4 passed (4)` and sets the exit code to 1. That was measured rather than assumed: the
  mutation below ran, the message appeared, the count said passed, and `EXIT=1`. Worth stating
  because "the tests passed" and "the run failed" are both true here, and a reader who checks only the
  first will believe the teardown works.

### Mutation battery

| mutation | expected | observed |
| --- | --- | --- |
| the report says one more case than the index holds | the corpus-count assertion fails | 2 failed / 97 |
| the teardown attempts nothing (`void cold` for every removal) | the survival assertion fires | `survived teardown: expected { present: true, registered: true }`, `EXIT=1` |

The second also documents the limit of the rule: a failure in `afterAll` is reported on stderr and in
the exit code, and **not** in the `Tests N passed` line.

### Acceptance

| gate | result |
| --- | --- |
| the withdrawal | three hypotheses tested and refuted, each with the command that refutes it |
| the write trace | 60 `_restore` writes, all under `/tmp`, none in the repository |
| the read-only probe | `chmod 444 scripts/check-doc-counts.mjs` → suite green, zero `EACCES` |
| the concurrency probe | two simultaneous runs green; three `test:coverage` runs green |
| the teardown report | `own` asserted, `others` named as predating the run |
| `core` | **188 / 4690** |

## Finding 273 — the half of G4 that no caller could reach

The corpus grew to fifteen this round, and adding it changed nothing in the suite — the counts the
guards compare are now derived, so a new case is a new case rather than seven edited numbers. That
result was the point of finding 271, and it also meant the round had to look somewhere else for a
defect. It found one in the gate that was supposed to be checking the corpus's difficulty spread.

### What the gate says, and what it was asked

`checkG4Solvability` answers two questions:

```ts
for (const c of bundle.cases) { ... }               // can a baseline locate this case's root cause?
const graded = bundle.cases.filter((c) => c.difficulty !== undefined);
if (graded.length >= distributionMinCases) { ... }  // are the levels spread across L1..L4?
```

`check-fault-cases.mjs` asked it **once per case**, with a bundle holding that one case:

```js
const withSignals = { ...bundle, signals: { [caseId]: signals } };   // bundle.cases === [parsedCase]
const solvability = core.checkG4Solvability(withSignals, outcomes, { minSolvers: 2 });
```

So `graded.length` was 0 or 1 on every call against a `distributionMinCases` of 10. The branches
below it — `DIFFICULTY_SKEWED_EASY`, `DIFFICULTY_SKEWED_HARD` — **could not be taken**, by any input,
from the only caller that owns the corpus. The corpus holds fifteen cases and five of them state a
level, so the first branch was one annotation away from being reachable and still unreachable by
construction.

That is the shape this volume keeps recording, in its least visible form: not a check that passes
vacuously on this data, but a check that **no caller can reach on any data**. `guard.test.ts` proves
the branches work — it builds ten `L1` cases and watches the gate refuse them — so the gate is not
broken. The wiring is. A unit test of a function cannot see that its only caller passes one case.

### The split, and why it is the same one G2 got

`checkG4Solvability` is now a composition:

| function | subject | asked |
| --- | --- | --- |
| `checkSolvability(bundle, outcomes, options)` | one case | per case, with that case's telemetry |
| `checkDifficultyDistribution(bundle, options)` | the set | once, over every annotated case |
| `checkG4Solvability(...)` | both | where a caller has both |

This is the arrangement finding 270 gave G2, and for the same reason: two questions with different
subjects cannot be asked of one bundle whose size is decided by the caller. The difference is that G2
was unreachable *cheaply* — twenty-six notifications of one defect — while this one was unreachable
*silently*: a rule that never runs reports nothing at all.

### Three wiring defects the split exposed

1. **The population was wrong.** The first draft collected graded cases where telemetry was
   collected, so a case without derived signals did not count as annotated. A level is a property of
   the annotation; a signal is a property of the derivation. `allCases` now records every case as it
   parses, and `gradedCases` is filled there too.
2. **The graph was recorded inside the telemetry block.** `firstGraph` was set where signals were
   expanded, so "the corpus has a graph" was false for a corpus with no telemetry — and the
   distribution check, which needs a graph to build a bundle, then skipped. It is recorded with the
   case.
3. **The coverage line lived inside the export block.** A corpus whose cases carry no telemetry
   exports nothing, so the line `difficulty N of M` vanished from exactly the runs that needed it.
   It is printed at the top level now.

Each of these was found by a test that had to fail, and each was first written the wrong way in this
round — the third one was caught only after the first two were fixed and the tests still passed
without the line.

### Why the count is printed at all

`FaultCase.difficulty` is optional and `difficultyFor(undefined)` returns `medium` — documented, and
correct: an exporter has to emit a word from a closed set. The consequence is that **an unannotated
case and a case measured as medium are the same word in every output this repository produces.**
Ten of fifteen cases are in that state today. Printing `difficulty 5 of 15 case(s) state a level; the
distribution rule applies at 10` is the smallest thing that separates "not measured" from "measured
and fine", and it is the reason the rule's absence could be noticed at all.

### Mutation battery

| mutation | expected | observed |
| --- | --- | --- |
| the whole-corpus distribution check is deleted | both `DIFFICULTY_SKEWED_*` tests fail | 2 failed / 102 |
| the check is asked over `telemetryCases` instead of `allCases` | same two, because the fixture corpus carries no telemetry | 2 failed / 102 |

The second is the one worth keeping: it is the defect the first draft actually had.

### Acceptance

| gate | result |
| --- | --- |
| the corpus | **15 of 30**, 37 entities, 23 edges, floor 15 |
| the new case | `config-datasource-url-orders`, four layers, 3 checkpoints, all resolve |
| the split | `checkSolvability` / `checkDifficultyDistribution` / `checkG4Solvability`, exported and enumerated |
| reachability | a ten-case `L1` corpus is refused (`L1 share 1.000 exceeds the 0.2 ceiling`), a spread one passes |
| the report | `difficulty 5 of 15 case(s) state a level; the distribution rule applies at 10` |
| `core` | **188 / 4695** |

## Finding 274 — difficulty had no definition, and a gate was reading it

The round was supposed to annotate ten more cases so that the distribution rule — reachable since
finding 273 — would finally have a population. Before writing any label, the obvious question was
what the labels mean. The answer, after a sweep of the repository, is that nothing says.

`docs/data-model.md` declares the field as `difficulty?: 'L1'|'L2'|'L3'|'L4'`.
`docs/targets/cloud-opsbench.md` publishes the projection onto `easy`/`medium`/`hard`. Nothing
anywhere states what makes a case L3 rather than L2 — not the schema, not the audit, not the corpus's
own `why` texts.

### What fills a gap like that, measured

The corpus has five annotated cases. Their structure:

| case | declared | steps | kinds the chain touches |
| --- | --- | --- | --- |
| `history-cart-network-delay` | L2 | 1 | service |
| `history-kafka-consumer-lag` | L2 | 1 | service, mq |
| `history-queue-watermark-ledger-writer` | L3 | 1 | service, mq |
| `history-unhandled-exception-export` | L3 | 1 | service, mq |
| `history-checkout-cpu-saturation` | L2 | 2 | container, pod, service |

Two cases with **identical** structure are labelled L2 and L3, and the case with the **most**
structure is labelled L2. Each label was a judgement made once, in isolation, and no two of them are
comparable. That is what an undefined field collects.

The structural facts are also thin: depth is 1 for twelve cases and 2 for three; breadth is 1, 2 or 3.
Four combinations in total, so a difficulty that were a function of structure would have four values
and no ability to spread.

### What this round did not do

It did not invent the definition. A definition would have to say what difficulty is *for* — model
accuracy on the case, distance from the easiest hypothesis, number of plausible wrong answers — and
every one of those needs evidence this repository does not have: one LLM provider, two local
baselines, no accuracy measurement per case. Writing it from a chair would have produced the same
thing the corpus already had, one level up.

It also did not annotate ten more cases by feel. That would have made the distribution rule run on
numbers with no more standing than the five that contradict each other.

### What it did

It stated the one property any definition must have, and made it checkable.

**Monotonicity**: a case cannot claim less structure than its own chain carries. If following a fault
through an intermediate entity is what costs a reader, then a two-step chain cannot be L1, whatever
else L1 might mean. This is weaker than a definition; it is also the only part of one that can be
derived from the data rather than decided in a meeting.

`difficultyFloor({ case, graph })` derives it from two facts the case carries: `depth` (causal steps)
and `breadth` (distinct entity kinds the chain and the root cause touch).

| steps | kinds | floor |
| --- | --- | --- |
| ≥ 3 | any | L4 |
| 2 | any | L3 |
| 1 | ≥ 2 | L2 |
| 1 | 1 | L1 |

`findDifficultyShortfalls` reports every case whose declared level sits below its floor. That is a
**problem** in the corpus guard and the run fails, because an annotation contradicting its own case is
a one-line repair.

### A dead branch, written and removed in the same round

The first draft had a fifth row: `breadth >= 3` at one step → L3. It cannot happen. A one-step chain
runs from the root cause to its consequence, so its two ends contribute at most two kinds unless the
root cause sits off its own chain — which the four-layer assessment already refuses. The test written
for that row failed against the implementation, and the row was deleted rather than the test, because
the test was right: `container → service` with the container as root cause is breadth 2, and it is
L2. This is the same defect the volume keeps removing, arising and being removed inside one round.

### The labels, and what they now claim

Eleven cases changed: one was **raised** (`history-checkout-cpu-saturation`, L2 → L3, the shortfall
the guard found), and ten unlabelled cases took their floor. The four labels that were already above
their floor were left alone — `history-queue-watermark-ledger-writer` at L3 over a floor of L2 is a
judgement that does not contradict anything.

So every level in the corpus now claims **at least** the structure it carries, and nothing more. That
is a weaker claim than a difficulty rating, and it is stated as such in the module and here.

### The distribution, which now runs on real labels

```
check-fault-cases: difficulty 15 of 15 case(s) state a level; the distribution rule applies at 10
check-fault-cases: difficulty spread L1 2 / L2 8 / L3 5 / L4 0; outside the target -- L4 share
                   0.000 is below the 0.1 floor
```

Two verdicts come out of that block and they are deliberately different:

- a **label below its floor** fails the run, because it is an annotation defect;
- a **missing hardest case** is printed and does not fail, because no correction to any label can
  produce an L4: the deepest chain in this corpus is two steps. Failing every run on a property only a
  new case can change is how a line becomes invisible, and printing it silently is the vacuous pass
  this volume keeps removing.

The decision it is waiting for is written in the progress log: either a case with a three-step chain
enters the corpus, or `minL4Share` is lowered as a product decision. Both are honest; neither is
"tune until green".

### Mutation battery

| mutation | expected | observed |
| --- | --- | --- |
| a case is labelled below its floor | the shortfall assertion and the run fail | `FAILED — 1 problem(s)`, naming the case |

The floor is also covered at the unit level by twelve cases — one per row of the table, plus the
root-cause-off-the-chain row, the unresolvable-reference row, and the empty-chain row.

### Acceptance

| gate | result |
| --- | --- |
| the floor | `difficultyFloor` / `findDifficultyShortfalls`, exported, enumerated, 12 unit tests |
| the corpus | 15 of 15 state a level; 0 shortfalls; spread L1 2 / L2 8 / L3 5 / L4 0 |
| the two verdicts | a label below its floor fails; a missing L4 is printed |
| `core` | **189 / 4710** |

## Finding 275 — top-K was the size of the ranking, so the claim could not be false

The corpus grew to fifteen cases and nothing went red, which left the round to look at what the
guards actually measure. This one measures nothing, and it has been saying so on every run.

### The two numbers that were one

```ts
const topK = Math.min(options.topK ?? DEFAULT_TOP_K, Math.max(ranking.length, 1));
return { ranking, topK };
```

`topK` was the smaller of the benchmark's K and the ranking's own length. Every case in the corpus
ranks one to three services, so on every case `topK` collapsed to `ranking.length`, and then

```ts
o.rankOfTruth !== null && o.rankOfTruth >= 1 && o.rankOfTruth <= o.topK
```

is true for **every answer that appears in the ranking at all**. G4's solvability rule was an
existence check wearing a precision claim: "both baselines place the root cause in their top-K"
meant "both baselines list the root cause somewhere", and a ranking cannot be longer than itself.

Measured before anything was changed:

```
history-checkout-cpu-saturation                    ranked=2 topK=2
history-kafka-consumer-lag                         ranked=1 topK=1
history-resource-ephemeral-capacity-image-builder  ranked=3 topK=3
...
mean ranking size 1.67
```

Fifteen cases, rankings of one to three, `topK === ranking.length` in fifteen of fifteen.

### The tests had been written to agree with it

`baseline-localiser.test.ts` carried:

```ts
expect(reading.topK).toBe(2);                                    // a two-candidate ranking
expect(rankServicesByPeakZScore(BASE, [])).toEqual({ ranking: [], topK: 1 });
```

and a test named **`honours a topK the caller asks for, and never exceeds the ranking`**, which
asserted exactly the behaviour the name describes. It was not a wrong expectation about a right
function: it was a correct expectation about a function whose contract was wrong, and the name is
how the contract got written down rather than questioned. This is the shape the volume keeps
recording, in its most comfortable form — a test that certifies the defect because the defect is
what the code does.

### What the fix is, and what it is not

`topK` is now the K the caller asked for, and `candidateCount` is the ranking's length. The two are
reported separately because they answer different questions, and `checkSolvability` gains a second
code:

| condition | code | what it means |
| --- | --- | --- |
| the answer is not within K of a ranking | `UNSOLVABLE_CASE` | the case cannot be scored by this method |
| the ranking is no wider than K | `LOCALISATION_UNCONTESTED` | no method was asked a question it could fail |

Changing the K alone would not have closed anything: a one-candidate case scored at top-3 is still
right by construction. So the second rule names that state instead of hiding it, and the corpus then
had to satisfy it. It did not — **fifteen refusals, one per case**:

```
check-fault-cases: 'history-network-mtu-blackhole-catalog' is not solvable by both baselines
  (peak-z-by-service=1, median-shift-by-service=1): the ranking holds 1 candidate(s) against a
  top-K of 3, so being within the top-K is not a constraint
check-fault-cases: FAILED — 15 problem(s) across 15 case(s)
```

### Why the corpus was narrow, and why that is a product problem

A case's signals file carries the series its incident is about, and every number in it has to quote
a sentence of the ticket. That rule is the reason the corpus can be trusted and the reason its
rankings are one to three services wide: **a ticket names the two components it is about**. A real
telemetry dump names every service in the system, with one series moving.

So the repair is not a looser rule but the missing half of the data: `background-telemetry.json`,
eighteen flat request-rate series, one per service in the graph, added to every case. It asserts
nothing about any incident, which is why it quotes nothing and why a checkpoint may not cite it —
the evidence resolver reads the case's own declarations, so `request_rate` fails as undeclared even
though the series is in the data.

Four rules, all in `fault/background.ts`, all unit-tested:

- **flat.** `baseline === post` with `noise: 'none'`. A jittered flat series would rank the quiet
  services against each other by floating-point rounding, and a quiet answer would read as "rank 3
  of the ones that showed nothing".
- **the whole system.** An entry the graph does not hold is a series attributed to nothing; a
  service the background omits is a candidate the ranking silently leaves out. Both are refused.
- **the case wins.** On the `(service, metric)` pair, so a case whose fault *is* a request-rate
  collapse can still say so.
- **not evidence.** No quote, and no checkpoint may resolve to one.

After it landed:

```
check-fault-cases: localisation over 15 case(s) at top-3, rankings 18-20 candidate(s) wide
  -- rank 1: 26, rank 2: 4 of 30 baseline run(s)
```

That line is the first measurement of the corpus's localisation difficulty, and it is not
flattering: a peak-z baseline is right at rank 1 in thirteen of fifteen cases. That is a fact about
derived telemetry (one series moves, the rest are flat) and it is now *stated* rather than
unmeasurable. The next round's problem is a corpus with a distractor that moves more than the
answer, which is the only way the rank distribution stops being a constant.

### `locatedRank`: present in the ranking is not located

Widening the ranking broke an assumption in the localisers. Before, a case whose answer emitted no
telemetry had `rankOfTruth: null` because the answer was **absent** from the ranking. With every
service in the ranking, absence became unreachable — and a case whose answer never moved would have
been reported as "solved at rank 2" because one other service moved and the tail was sorted
alphabetically.

`locatedRank(statistic, at)` returns `null` when the statistic is zero. A candidate that showed
nothing is not a candidate a method found; it is a line in an output. Both baselines call it, so the
distinction is one function rather than two implementations that could drift.

### Mutation battery

| mutation | expected | observed |
| --- | --- | --- |
| `topK` back to `min(K, ranking.length)` | the localiser and gate tests fail | 10 failed / 101 |
| a zero statistic counts as located | the quiet-answer tests fail | 3 failed / 101 |
| the background does not yield to the case | the override test fails | 1 failed / 19 |
| the background jitters | the flatness test fails | 1 failed / 19 |
| the corpus loses its background | every case is refused | 15 refusals, asserted in `background-telemetry.test.ts` |
| the background omits one service | the coverage rule fails | `omits the service 'cart-service'` |
| a checkpoint cites `request_rate` | the evidence rule fails | `which the signals file does not declare` |

All restored before the acceptance run.

### Acceptance

| gate | result |
| --- | --- |
| the K | `topK` is the declared K; `candidateCount` reported separately; 3 tests on `locatedRank` |
| the rule | `LOCALISATION_UNCONTESTED`, with the width and the K in the message; 4 gate tests |
| the corpus | 15 cases, rankings 18–20 wide, 0 refusals |
| the readout | `localisation over 15 case(s) at top-3, rankings 18-20 candidate(s) wide -- rank 1: 26, rank 2: 4` |
| the background | `fault/background.ts`, 4 rules, 24 tests, 100 % on all four coverage dimensions |
| `core` | **190 / 4746**, coverage 99.97 / 99.75 / 100 / 99.97 |
