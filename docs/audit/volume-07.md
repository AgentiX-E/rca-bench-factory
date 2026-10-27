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
