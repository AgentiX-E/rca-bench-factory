# Audit · volume 12

Findings 490–493, from the rounds recorded in `progress/volume-12.md`.

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

## Finding 492 — a case said its fault lasted eighteen minutes and its own file said thirty

`history-dependency-upstream-5xx-pricing` carries `durationMinutes: 18`, and its incident text says the
dependency "returned 502 on 60% of requests for 18 minutes". Its window ran from 09:00 to **09:42**, its
onset was 09:12, and its series declare no `hold` -- which is the declaration "the value is at `post`
for every one of the eight samples". So the post side was thirty minutes wide, one sample was 3.75
minutes, and the two ratios the case ships sat at 60 % for **thirty** minutes while the file said
eighteen.

The case also contains the correct number, in a place nothing compares: its own log line reads
`degradation window 09:12-09:30 UTC, 503 on tax calculation requests`. Three statements of one span in
one file, and the two that a reader would trust most disagreed with each other.

**Why the v3.72 rule could not see it.** `readDurationRestatement` fires when a parameter's value *is*
the excursion's `hold`, which is the coincidence `hold: 4` beside `burstMinutes: 4` written into the
corpus by accident. Eighteen is not eight, so the parameter was read as "a different quantity" and the
rule was silent -- correctly, by its own definition, and that definition was the problem.

**The repair moves the window.** It now ends at 09:30, which is the time the case's own log line names
and the time the ticket names. Eight samples of 2.25 minutes are eighteen minutes, `durationMinutes: 18`
is the episode's length rather than a comment on it, and the file states one fact three times instead of
two facts and a contradiction.

## Finding 493 — the same shape, and a note that said the reading carried no duration

`history-dependency-schema-change-currency-feed` declares `durationMinutes: 120` and its window ended at
**11:30** from an onset of 09:00 -- a hundred and fifty minutes of post side at 18.75 minutes a sample.
Its own checkpoint description already carried the repair: *"the two hours between the deploy at 09:00
and the revert at 11:00 -- the same interval the incident text states twice"*.

Both cases carried a parameter note saying *"the readings are shares and carry no duration of their
own"*. That sentence was false in the direction the author did not consider: a share that is elevated
from the onset to the window's edge is an episode with a length, and the length is the post side. The
note was written to explain why no reading *cited* the parameter, and it answered a different question.

**The repair moves the window to 11:00**, so a sample is fifteen minutes and eight of them are the two
hours the description names.

| quantity | before | after | why |
| --- | --- | --- | --- |
| 5xx-pricing post-window | 30.0 min | **18.0 min** | the window ends where the log line says the degradation ended |
| 5xx-pricing one sample | 3.75 min | **2.25 min** | thirty minutes divided into eight |
| schema-change post-window | 150.0 min | **120.0 min** | the window ends at the revert the description names |
| schema-change one sample | 18.75 min | **15.0 min** | a hundred and fifty divided into eight |
| cases naming their own length | 0 | **5** | the field did not exist before this round |
| parameters spoken for | 36 of 109 | **37 of 109** | one note became a checked number |
| G3 grid, localisation, similarity | unchanged | **unchanged** | a narrower window moves no value, and the grid reads values |

## The field the corpus was missing, and the four things it refuses

The corpus carries **fourteen** time-valued parameters. Five of them state how long the fault lasted --
`burstMinutes` twice, `splitDurationMinutes`, `durationMinutes` twice -- and nine are knobs the fault
ran under: `terminationGracePeriodSeconds: 30` is a kubelet setting, `retentionGapHours: 31` is a gap
the ticket measured, `readyAfterSeconds: 40` is how long a replacement took to serve. No rule over the
names can separate the five from the nine; a rule that guessed would be right five times and wrong nine,
which is the shape finding 489 recorded when `spike` carried a duration in its name.

`fault.durationParameter` is the case answering the question. Once named, the number is read against
`hold x spacing` in the parameter's own unit and to the millisecond, and `readDurationClaim` refuses
four ways:

| refusal | what is wrong |
| --- | --- |
| `unknown-parameter` | the name is not a key of `fault.parameters` -- a rename left it behind |
| `not-a-duration` | the parameter is not a `{ value, unit }` quantity in a unit of time |
| `no-episode` | the case's series draw no excursion, so nothing of its own is that long |
| `ambiguous` | its series hold for different lengths, so one number cannot be all of them |
| `disagrees` | the stated span and the drawn one are different numbers |

A case that names nothing is not refused. That is the boundary `fault/parameterNotes` draws from the
other side: there the file had to answer for a fact nothing read, here it may stay silent about a claim
it never makes -- so the guard prints how many cases answer (`5 named as the length of their episode`)
rather than turning a silence into a pass.

**The consequence a reader should know**: this rule can be satisfied by deleting
`fault.durationParameter`, and that is deliberate. The alternative -- refusing a case for not stating a
length -- would be a rule about the annotation's vocabulary, and nine of the fourteen time-valued
parameters are legitimately not lengths. What the field buys is that a case *which states its length*
can be wrong in exactly one way, and that way is caught.
