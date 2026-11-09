# Audit · volume 12

Findings 490–491, from the rounds recorded in `progress/volume-12.md`.

## Finding 490 — a case stated a duration its own telemetry contradicted, twice over

`history-resource-merge-burst-search-cluster` was written in v3.71 to say one thing: a saturation that
**ends**. Its incident text says the merge "stayed there for four minutes", its parameters declare
`burstMinutes: 4`, and its checkpoint asserts that parameter. Its telemetry declared `hold: 4`, and a
hold is a **count of samples**.

The two numbers were the same number, and that is what made the defect invisible. `expandSeries`
divides the post-window into eight intervals, so a sample in that case was **3.5 minutes** long and the
plateau the case shipped ran from 14:12 to 14:26 — **fourteen minutes of telemetry for a sentence that
says four**. Nothing in the repository compared the two, because the only machine-readable statement of
the duration was the parameter, and the parameter was compared with itself.

The class is older than the case. `history-network-partition-search-cluster` has said "the seventeen
minutes are the gap between 03:02 and 03:19" since it was annotated, in a window that ended at 03:40:
its `cluster_members_visible` series therefore stayed halved for **thirty-eight** minutes. Before
`hold` existed the corpus could not express an end at all, which is why nobody noticed — every series
held its post value to the window's edge, so a window was the only duration a case could have.

**The repair moves the geometry, not the sentence.** The merge-burst case's window now ends at 14:20,
so one sample is one minute and `burstMinutes: 4` is four samples rather than a coincidence of two
fours. The partition case's window now ends at 03:19, which is the time its text already names. Both
prose and data now state one fact, and the fact is the same one.

**The guard is `readDurationRestatement`.** It answers the only question the file can be held to: a
parameter whose value **is** the hold is asserting that one sample is one unit of that parameter, and
the window either makes that true or it does not. `readPostSampleSpacing` computes the third number
nobody wrote down — `(windowEnd − onset) / SERIES_POINTS` — and the refusal prints all three:

```
'burstMinutes' states 4 min beside a hold of 4 sample(s), and one sample is 3.5 min: the same number
is a count of samples in one field and a length of time in the other, and the two are one fact only
when a sample is one min
```

Run over the shipped corpus before the repair, it refused exactly one case — the one this round
introduced — and left the other seven time-unit parameters alone, because `splitDurationMinutes: 17`
beside a hold of eight is a **different quantity**, not a restatement. That is the precision the rule
needs: `retentionGapHours: 31`, `terminationGracePeriodSeconds: 30` and `keysIntervalSeconds: 30` are
facts about the system, and a rule that refused them would be a rule about vocabulary.

### What the repair cost, measured

| quantity | before | after | why |
| --- | --- | --- | --- |
| merge-burst post-window | 38.0 min | **8.0 min** | one sample becomes one minute |
| partition post-window | 38.0 min | **17.0 min** | the window ends where the text says the links came back |
| pair windows overlapping | 0 | **0** | shrinking a window cannot create an overlap |
| L4 cases the corpus can lose | 2 | **1** | an L3 case was added; five of thirty-three is 0.152, four of thirty-two 0.125, three of thirty-one 0.097 — below the 0.1 floor |

## Finding 491 — a list of types that named one type twice

`assessDiscriminatingPower` reports two alternative readings of the labelled category, each with the
expected **types** it disagrees with, and a union of them. The union was a `Set` and the two per-reading
lists were arrays, so the fields disagreed about what they were counting. Nothing could see it while
every type had one sample.

The corpus now has two `queue-disk-watermark` samples, and both disagree with the row-shadowing
reading. The list came back as `redis-latency, feature-flag-misconfiguration, queue-disk-watermark,
ingress-timeout-misconfiguration, queue-disk-watermark`: five entries, four types, in a field documented
as "the expected types this reading classifies differently". A count of rows wearing a type's name is
the same defect the corpus keeps finding in prose, in a field that a report prints.

Both lists are sets now. The count of disagreeing types is four of thirty-three everywhere it is
printed — `differ` was already four, which is how the duplicate survived: the union was right and the
parts were wrong, so any test that read the union agreed with the report.
