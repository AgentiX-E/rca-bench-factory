## v3.142 · Every round states its own size twice, and only one of the two statements had a reader

A round's ledger says how large the suite is in three rows, and it says how large the suite became in
a fourth: the `new tests` row's span, `6,921 -> 6,946, +25`. The first three are held to a scope, to
each other, to the live measurement and to a dated token by four rules. The fourth was read by
nothing, because it is written in no shape those rules know: `6,921 -> 6,946, +25` is not
`N files, M tests`, and the label `new tests` names no scope, so rule 4 -- the rule that exists to
catch exactly this, a count in a shape nobody thought of -- was not addressed to it either.

The span is the only place in the corpus where a round's own count appears twice. That is what makes
it worth reading: it turns a date into something checkable. A row marked `(at v3.117)` says that round
measured this number, and the round's own span says what that round measured -- two statements about
one quantity, in one section, with nothing comparing them. Compared, five of them disagree.

### The statement nobody read

| the row | rows | read before this round |
| --- | --- | --- |
| publishes an absolute span, and a delta | 67 | no |
| publishes an absolute span, no delta | 7 | no |
| publishes a delta only (`**9**: four for the rule, five for the reader`) | 31 | no |

**105** rows, **74** spans. The rule reads the span in two shapes, in order so the delta is captured
when it is there; checks the three numbers of a delta against each other -- all **67** hold, which is
the expected result and still worth a reader, because a delta typed by hand is a subtraction somebody
did in their head; refuses an arrow it cannot read as a span, because a shape the reader does not know
is indistinguishable from a row with no span, which is rule 4's defect one unit over; and compares the
span's end with the count the round published of itself.

"What the round published of itself" is the whole difficulty. The volumes quote each other's rows on
purpose -- v3.141's ledger carries three rows dated `(at v3.140)` -- so the reader takes only the two
spellings that claim the round: `(at v3.144)` under it, and `(at vN)` where N is the round it
sits under. A row that says neither is a number quoted from somewhere, and a rule that took the last
row under a heading would let a copied record decide whether the round's own span is true.

Two rows read `**12**, all in \`site-proofs.test.ts\` (18 -> 30)`, and that span is one file's count,
not the suite's. The file is named **before** the span, and position is what separates the two cases:
a row describing its delta names test files all the time (`two in ci-budget.test.ts`), and those come
after. The class is counted and printed rather than passed.

### What the rule found

Five spans ended nowhere near the count their round had published beside them: v3.54, v3.69, v3.89,
v3.117 and v3.131. Four of them are one mistake -- a number that belongs to a **later** round --
and the reachable history says when it arrived:

| round | the span ends at | the count beside it | the commit that wrote the count |
| --- | --- | --- | --- |
| v3.89 | 6,338 | 6,349 | `docs(v3.95)` |
| v3.117 | 6,691 | 6,700 | `fix(v3.118)` |
| v3.131 | 6,835 | 6,845 | `docs(v3.133)` |

In each case the commit is a later round's and the span was written by the round it belongs to. So
the mechanism is not a typo, it is the repair rule 3b *asks for*: a round finds a row marked as the
current state under an old heading, rules 3b refuses it because "now" is one round, and the repair it
suggests is to write `(at vN)`. Applying that takes a fresh measurement, and the number written beside
the date is the one just taken. **The date makes rule 3 stop asking, and the number that arrives with
the date is today's.** That is how a record comes to name a measurement its round never took.

v3.54 is the fifth kind, and it is why the reader must be able to say *which* count a span is about.
Its span ends at 6,061 -- its `repo` count after the round's 25 tests, not its `core` count: the
ledger's two rows were measured before the round's own tests landed. All five were repaired to the
round's own span, four by reverting the later number and v3.54 by applying its own delta to both rows,
and the gate now prints the split it found: **70** spans end at the round's `core` count and **1** at
its `repo` count. Nothing in the corpus says which of the two a span is about.

### The date that read as no date

`docs/progress.md` writes a date as `(at v3.41)`. volume-17 writes it fifteen times as
``(at `v3.102`)`` -- the same statement, rendered. The pattern demanded the plain spelling, so those
fifteen rows, across five rounds, carried no date as far as any reader was concerned: rule 3c could
not refuse a future date among them, and the round's own count could not be recognised, because a row
is the round's own exactly when it is marked current or dated to that round. The second blindness is
what the earlier section found: six spans had nothing to compare with, and five of them were these.

One widening fixes both, and the measurement says so: spans with no count to compare against fell
from **6** to **1**, and the one that remains sits under no round at all. The backticks are optional
inside one pattern rather than a second pattern, because a second pattern is a second reader of one
mark -- which is how this round's first defect came about.

### The round's own defects

- **Five mutations survived the first battery, and every one was a hole in a fixture.** No case named
  a test file *after* the span (so "any file is the span's subject" survived); no case put a row with
  no date and no marker into a round's own section (so "any row under the round is its own" survived);
  no case refused a delta the reader had already captured (so "captured and ignored" survived); and
  the refusal's message was only ever asserted for the first count it names, so trimming it to one
  survived. Each hole became a case, and the battery is 12 mutations and 24 reds.
- **One mutation was equivalent rather than surviving.** `end - start !== delta` and
  `end - delta !== start` are the same predicate over integers, so the second reading of the first
  check could not be caught by any case. It was replaced with a *partial* check
  (`delta > end - start && ...`), which is a real weakening and is caught.
- **The first version of the rule insisted on one scope.** It compared every span with the round's
  `core` count, which is wrong for v3.54 and would have demanded that its ledger read 6,061 for
  `core` -- adding the cli suite's 187 tests into core. The vocabulary constant that stated the scope
  (`SPAN_SCOPE = 'core'`) was deleted rather than repaired: the corpus does not state a scope, and a
  constant asserting one would have been a rule about the corpus's intent instead of about its
  numbers. The reader now offers every scope and the green line says which each span landed in.
- **The counts moved twice** -- 6,946 at v3.141, 6,956 after the ten cases -- and `doc-counts.json`,
  the three current rows and the repository table were retaken rather than edited.
- **`gate-sites.json` moved with a line number**, 424 to 465, and the deriver carried all 146
  annotations and all 102 throw annotations across on its own: nothing had to be re-attached by hand
  this round, which is the first time that has been true since the annotations were written. The
  re-derivation also normalised twelve `\u2014` escapes to the character they stand for, which is what
  the writer produces and what the checker compares.
- **volume-19 was 198,679 bytes of 200,000** when this round began, so the record opens volume-20.
  A volume is split at a round boundary, not inside one, and this is the first split since v3.121.

### Falsifications

| the mutation | reds |
| --- | --- |
| the span is compared with the count it started from | 5 |
| the delta is not checked against the ends | 1 |
| the delta is only checked when it is the larger number | 1 |
| a file named after the span counts as its subject | 1 |
| a span with no before-count is refused rather than counted | 3 |
| a span under no round is counted as agreeing | 1 |
| any row under the round counts as the round's own | 1 |
| the delta is captured and then ignored | 1 |
| the plain date spelling stops reading | 7 |
| an arrow that cannot be read is counted as a row with no span | 1 |
| the split prints a total and no scope | 1 |
| the span refusal names only the first count the round published | 1 |

**Twelve mutations, 24 reds**, measured on the repaired tree. The first pass was 12 mutations and 15
reds with five survivors, and the five are the first section of *The round's own defects*.

### Readings

> Ledger for `v3.142`.

| item | value |
| --- | --- |
| CI | run `45376896602` on `b821d265`: **8 of 8 jobs success**, 795 s (10:39:44 -> 10:52:59), the run that published v3.141 and the thirty-fourth reading. No second attempt: the pair in the history is still run `45351350110`'s |
| `pnpm run docs:check` | **23 steps, exit 0** |
| `core` test suite | **260 files, 6956 tests passed** (at v3.142) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.142) |
| repo test suite | **264 files, 7143 tests passed** (at v3.142) |
| new tests | **6,946 -> 6,956, +10**: eight for the span (the agreeing end, the refusal naming every count, the arithmetic, one file's span, a delta-only row, an unreadable arrow, a span under no round, a file named after the span), one for the row that names no round, and one for the date written as code. Counted from the suite, not from this sentence |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** |
| the budget gate's axis | `2.0x of the slowest reading ... with the middle of its 34 readings between 20 s and 21 s -- against which the bound is 88x; ... the 36 bound(s) that have one sit between 2.4x and 88x ... and 2 of the 38 divide by a middle of 0 s` -- the recording of run `45376896602` moved the axis by one reading |
| the noise floor | **151 s** on `batteries-heavy / Type-miss probe battery` (356 s -> 507 s), attempts 1 and 2 of run `45351350110`; 1 pair of 34 readings, unchanged: this round added no second reading of a tree |
| the readings | **34** readings, 33 runs, 31 trees |
| the spans | **106** `new tests` rows, one of them this round's; **75** spans, **68** with a delta and all 68 holding; **72** ending where the round's own count ends (71 `core`, 1 `repo`), **2** about one file, **31** with no before-count, **1** under no round |
| the noun inventory | **58** nouns in 77 gate/noun pairs and 11 judgements; `span(s)` is new and printed by one gate |
| `docs/acceptance.md` | **55** clauses across **38** rounds; index **55** rows |
| the census | **4** coincidences, unchanged |

### Left open

- **A span says how large the suite is and not which suite.** Seventy of the seventy-two are about
  `core` and one is about `repo`, and the corpus states the scope in neither place: not in the label,
  not in the span. The reader offers every scope and prints which one each span landed in, so a
  round that meant `repo` is not refused -- which is also a reader that cannot tell a typo from a
  different population.
  `[open: whether a span should name its scope in words, as a suite row must -- the label says "new
  tests", which is true of all three scopes, and a span that names one would be checkable in one
  place instead of two; and whether that is worth 74 edits to ledgers whose numbers are records]`
- **Thirty-one rounds publish a delta and no before-count, and two spans count one file.** The
  classes are counted and printed, so they are a stated residual rather than a silent gap -- but a
  delta with no before is a number that cannot be compared with anything, which is the defect this
  round was about, left in place for a third of the rows.
  `[open: whether a delta should require its before-count -- the older rounds wrote "**9**: four for
  the rule" because the suite's size was four rows further up, and a rule demanding the span would
  mean reconstructing thirty-one numbers nobody measured; and whether a file's own count could be
  read at all, since the file is a test file and the reader would have to count its cases]`
- **The rule can refuse a contradiction but not say which side is the record.** Five rounds were
  repaired, and the direction came from `git log -S`: the commit that wrote the number was a later
  round's. The gate cannot see that -- it sees two numbers and no history -- so a future round that
  meets a sixth will have to do the archaeology again, and a reader who "repairs" the span instead of
  the count will make the record worse while turning the gate green.
  `[open: whether the corpus should record which commit wrote a ledger row, so a repair has a side to
  take without git -- the snapshot that holds counts is rewritten every round, so the question is
  whether the right place is a history rather than a snapshot; and whether the refusal could name the
  round whose count the offending number belongs to, since the corpus's other rounds publish spans
  and the number is usually one of them]`

## v3.143 — a bound's margin in the machine's own movement, and a reading named by two fields

`O-121` asked whether a bound should be argued against the noise floor as well as against the
slowest day, and whether one pair is enough to say what the machine does. The first answer is
arithmetic and it is negative; the second is no. The round measured what the question was really
about, and found on the way that seven sentences name a run where a reading belongs.

### The arithmetic, which closes the first half of the question

For one step, both readings of the pair are readings of the same command, so
`movement = |a - b| <= max(a, b) <= slowest`. `R10` demands `bound >= 2 x slowest`, so
`headroom = bound - slowest >= slowest >= movement`. **A rule that refused a headroom narrower than
the movement could never fire on a tree whose bounds `R10` holds**, and a rule that refuses nothing
is the shape every reader learns to skip. So no rule was added.

What was added is the number the question was reaching for: the headroom expressed in the movement
the step has itself shown.

| the bounds | count |
| --- | --- |
| carry their own `timeout-minutes` | 38 |
| have a second reading of their own tree | 38 |
| did not move at all between the two readings | 8 |
| no second reading has timed | 0 |

The narrowest is `sensitivity / Install the shells the suite cross-checks against`: **222 s** of
headroom above its slowest day of **198 s**, against a movement of **99 s** -- `2.2x`. The widest is
the same install command in `backend`, **912 s** against **4 s**, which is not a margin but a bound
nobody has come near. The clause prints the narrowest with both numbers and counts the two classes
it cannot divide: a step that came back identical has no multiple to take, and a step no second
reading timed was never asked.

### The word "variance" was doing work the measurement does not support

The sentence about the history called the widest difference "the runner's variance". The same file
contradicts it: ranked by *relative* movement, the two install steps come first --

| step | two readings | relative movement |
| --- | --- | --- |
| `sensitivity / Install the shells ...` | 109 s then 10 s | **9.9x** |
| `batteries / Install the shells ...` | 23 s then 9 s | **1.6x** |
| `verify / Lint` | 337 s then 478 s | 0.42x |
| six steps | identical | 0 |

-- and a package store that was hit in one attempt and missed in the other is the tree's state, not
the runner's speed. The sentence now says "the runner's variance and the cache's state together",
which is what the pair measures. The residual is `O-126`, the bound sized in one mode of a bimodal
step, which is not sized for the other.

### Seven sentences named a run where a reading belongs

`v3.141` made `(run, attempt)` the identity of a reading, and the reader, the merge and `R10`'s
ordering learned it. The sentences that name one did not, and the defect had four shapes:

1. a run printed where a reading belongs -- `R10`'s refusal, the tightest multiple, the widest
   headroom, the ceiling's slowest day, the prefix allowance in both directions;
2. a reader that builds the coordinate and drops the field -- `readingsOfCommand` returned
   `{seconds, run, job, step}`;
3. a caller that rebuilds the object -- the headroom's `fast` was assembled field by field;
4. a tie rule that orders by half the coordinate -- `jobDays` and `worstPrefixReading` broke ties by
   run alone, so two equal days of one run had no order, and an order that does not exist is a
   sentence that changes with the file's append order.

One function now prints it -- `run N` for attempt 1, because that is what every recording written
before the field existed was, and `run N attempt M` otherwise -- the three readers carry `attempt` in
what they return, and every tie is decided by the whole pair.

The defect is latent in the shipped history, which is what makes it a defect: the slowest reading of
the only pair is attempt 2 of run `45351350110` (`batteries-heavy / Type-miss probe battery`, 507 s),
and its bound is 1080 s, so no sentence prints it today. The next bound sized under that step would
have been refused with a coordinate that sends its reader to the wrong attempt.

### The round's own defects

- **Two mutations survived the first pass, and both were fixture holes.** A selection test whose
  narrowest candidate came *last* answers the same number whichever way the comparison runs -- the
  fixture could not tell the two implementations apart. And a tie test on a **sorted** history cannot
  distinguish "first wins" from "the later attempt wins", because on a sorted history they are the
  same reading; the case that decides it hands the rows over in the order that separates them, and
  the reverse is true for the *fastest* tie, which needs a reversed history precisely because its
  rule takes the older reading.
- **`coordinateOf` was exported and unnecessary.** `scripts-are-classified` refuses an export no
  other file takes, and the function is used only inside its own module: the export came off rather
  than the rule being widened.
- **The suite's own pins moved four times**: `readingsOfCommand`'s two ends and `jobDays`' day now
  carry `attempt`, so four `toEqual` expectations gained the field; `worstReadingFor`'s case in
  `ci-readings.test.ts` gained it too.
- **The ledger's previous round was still marked current.** v3.142's three suite rows said
  `(at v3.144)` and this round's suite is 23 tests larger, which `check-doc-counts` refused
  -- the same mechanism finding 643 described, applied in the right direction: the rows are dated
  `(at v3.142)` with the numbers v3.142 measured, not with today's.

### Falsifications

| the mutation | reds |
| --- | --- |
| the coordinate names the run and drops the attempt | 7 |
| the coordinate always prints the attempt | 7 |
| the slowest reading of a command loses its attempt | 5 |
| the slowest tie ignores the attempt | 1 |
| the fastest tie ignores the attempt | 1 |
| a day loses the attempt it was measured in | 1 |
| the prefix loses the attempt it was summed from | 1 |
| the headroom is measured from the recording rather than from the fastest reading | 3 |
| the margin is taken against the recording instead of the slowest day | 1 |
| the margin divides the movement by the headroom | 1 |
| a movement is kept only when it is the first of its step | 1 |
| two readings that share no step still count as a pair | 1 |
| a step only one reading timed contributes the whole reading as a movement | 1 |
| the floor takes the narrowest movement rather than the widest | 2 |
| a bound whose step did not move is counted as having a margin | 1 |
| a bound whose step was never read twice is counted as checked | 1 |
| a bound no reading measured twice is treated as a margin of zero | 1 |
| a negative headroom is printed as a number | 1 |
| the bounds that did not move are not counted | 1 |
| the classes are joined without the last `and` | 2 |
| the multiple is printed to two places at every size | 6 |
| the floor is called the runner's variance alone | 2 |
| the margin stanza runs on a history with no pair | 1 |

**23 mutations, 51 reds**, measured on the green tree, no survivors.

### Readings

> Ledger for `v3.143`.

| item | value |
| --- | --- |
| CI | run `45393534319` on `9c260c1f7`: **8 of 8 jobs success**, 1,003 s, the run that published v3.142 and the thirty-fifth reading. No second attempt, so the history's only pair is still run `45351350110`'s |
| `pnpm run docs:check` | **23 steps, exit 0** |
| `core` test suite | **260 files, 6979 tests passed** (at v3.143) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.143) |
| repo test suite | **264 files, 7166 tests passed** (at v3.143) |
| new tests | **6,956 -> 6,979, +23**: six for the coordinate (five sites and the guard against printing `attempt 1`), nine for the margin and the classes it counts, five for the selection and the ties, one for a step only one reading timed, one for a headroom that is negative, and one for the fastest tie. Counted from the suite, not from this sentence |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** |
| the margins | **38** bounds carry their own timeout and **38** have a second reading of their own tree; the narrowest margin is **2.2x** (`sensitivity / Install`, 222 s over 99 s) and **8** did not move at all |
| the movements | widest **151 s** on `batteries-heavy / Type-miss probe battery` (356 s then 507 s, attempts 1 and 2 of run `45351350110`); by relative movement the two installs lead, at **9.9x** (109 s then 10 s) and **1.6x** (23 s then 9 s) |
| the readings | **35** readings, **34** runs, **33** trees |
| the noun inventory | **58** nouns in 77 gate/noun pairs and 11 judgements, unchanged: the clause prints `bound(s)`, `difference` and `headroom`, all of them words the gate already used |
| `docs/acceptance.md` | **57** clauses across **39** rounds; index **57** rows |
| the census | **4** coincidences, unchanged |

### Left open

- A bound sized in one mode of a bimodal step: the two installs did, by 9.9x and 1.6x, so a bound
  sized from a store hit is a bound sized for half the step's behaviour.
  `[open: whether a step whose cost is dominated by a cache state should declare it, so that `R10`'s
  denominator is read per mode rather than across them -- a declaration would be a promise about a
  state no recording holds, which is what `R15` already does for the cold prefix -- and whether the
  margin clause should say which of its 38 bounds rest on a step that moved by more than half its own
  reading, since two of them do]`

## v3.144 — the recorder decided older and newer on the run id, and wrote the tree its gate refuses

`O-122` recorded a state rather than a mistake: `--attempt 1` after `--attempt 2` of one run was
accepted, the recording moved backwards, and `R10` refused the tree the recorder had just written. The
round answered both of the entry's questions, found that the same comparison had two more shapes
behind it, and left one new entry where the answers stop.

### What the write did to the two files

| step | `ci-baseline.json` | `ci-readings.json` |
| --- | --- | --- |
| before | `(7, 2)` | `… (7, 2)` |
| `--attempt 1` | `(7, 1)` -- rewritten | `… (7, 1), (7, 2)` -- appended and **sorted**, so the tail is still `(7, 2)` |
| `R10` next | older than the history's tail | "the history holds a reading of run 7 attempt 2, which is newer than the recording (run 7)" |

The refusal is right and its advice is not: "record that run as the recording rather than beside it"
names the act the recorder had just been asked to take.

### The two questions, and why the second dissolves

Whether the recorder should refuse an older attempt is not policy. `R10` compares the recording with
the history's **tail**, and the tail is a maximum over the file, so no write of `ci-baseline.json`
alone can move it; an older attempt could only be the recording if the newer row left the history, and
the only way to remove a row is the hand edit both files refuse in the same words. So the repair the
entry was reaching for -- "the latest attempt was red" -- is not reachable by moving the recording. It
is reachable by the other relation: the older attempt's seconds go into the **history**, where `R10`'s
denominator reads them, while the recording stays on the newest measurement.

Whether the recording holds the newest attempt by measurement time or by attempt number is not a
question the file has to answer: a re-run of one tree increments `run_attempt`, so attempt `N + 1` was
measured after attempt `N`, and the two orders are one order. The pair *is* the order.

### The same comparison had a second shape, and it was hiding the noise floor

The seed's relation to the recording was decided by subtracting run ids, so `--seed --attempt 1` of
the recorded run was refused as "the recording", in a sentence about one day entered twice. It is not
one day. It is a second measurement of one tree -- the pair `v3.143` had just measured every bound's
margin against -- and the history already holds one:

| run | attempt | commit | `batteries-heavy / Type-miss probe battery` |
| --- | --- | --- | --- |
| `45351350110` | 1 | `45eaacff` | 356 s |
| `45351350110` | 2 | `45eaacff` | 507 s |

What the recorder could not do is append a second one for the run that *is* the recording.

### The third shape: the file that says which day is the newest, overwritten

`if (!SEED) writeFileSync(OUT, …)` ran whatever was already at `OUT`. For a recording that could not
be parsed, that is an unanswerable question answered by deleting it: the history keeps the newer day,
and the tree fails with `R10`'s advice about a recording the recorder had just written. It is refused
now in two shapes -- a file that does not parse, and a file that parses into something naming no run
-- each with the act that fixes it. The two files were asymmetric before this round: a history that
cannot be read was left alone and reported, and the recording was overwritten in silence.

### One ordering, one name

`orderOf` is the comparison, and every caller that orders readings goes through it: the sorts in
`readReadings` and `mergeReading`, which were the same expression written twice; `R10`'s two
directions; and the recorder's three refusals. `coordinateOf` was private until this round, because
nothing outside its module printed a reading, and the recorder's two report lines use it now -- a
recording of attempt 2 says `from run 45421625317 attempt 2`. That is the eighth sentence to name half
a reading, and it is finding 646's defect in the tool that writes the file the gate reads.

The defect is latent: no run in the shipped history is the recording twice, so nobody who is not
trying can perform the backwards write today. It becomes reachable the first time the recording's run
is re-run, which is the ordinary way a red tree is retried.

### The round's own defects

- **A backtick inside a template literal ended the string.** `R10` is written as code in this tree, and
  copying that into a `` `…` `` message produced `SyntaxError: missing ) after argument list` at the
  first run of the recorder cases -- 27 red cases across two files, all from one character. The name
  stays and is escaped; the alternative, a message that says "the rule about the newest reading", is a
  sentence a reader cannot look up.
- **Three seed refusals lost their proof annotations.** `derive-gate-sites.mjs` carries an
  annotation across a rewrite **by fingerprint** of the message, and this round changed all three
  messages (they now print two coordinates). The deriver said so -- `throw annotations: 99 of 102
  carried, 3 dropped` -- and the five new throws beside them had none, so the row was `status:
  undefined` until each named its test. `104 statement(s) partitioned` in four baskets, of which
  **16** are now `fatal`, two more than v3.141.
- **A fixture reported one attempt and was asked for two.** The seed cases needed `run_attempt` in the
  run body *and* `filter=all` on the jobs request; without both, the recorder asked for an attempt the
  fixture never reported. The second attempt is now the first, a minute later, with a minute more on
  the battery -- one tree, two different numbers -- because a re-run that measured identical seconds
  cannot answer "which attempt was read".
- **A refusal changed its noun and one case had to follow.** "a second entry for one day would weight
  that day twice" became "for one measurement ... that measurement", because the identity is the pair
  and the old wording was the defect stated in the message.

### Falsifications

| the mutation | reds |
| --- | --- |
| the ordering compares run ids and calls two attempts of one run one day | 7 |
| the ordering adds the two fields instead of comparing them | 1 |
| the ordering reads an absent attempt as the zeroth | 2 |
| a reading that names no run is compared as NaN | 1 |
| the attempt is the high half of the pair | 3 |
| the coordinate names the run and drops the attempt | 12 |
| the history is ordered by the run id alone, so two attempts are one day | 2 |
| a measurement older than the recording is written anyway | 1 |
| a measurement newer than the recording is refused as well | 1 |
| the recording is placed by the run id alone, so an older attempt looks current | 3 |
| an older attempt of the recorded run is not a seed either | 1 |
| the seed that is the recording is appended | 1 |
| a recording that cannot be parsed is replaced rather than refused | 2 |
| a recording that names no run is placed | 1 |
| the report names the run and drops the attempt | 1 |
| the seed report names the run and drops the attempt | 1 |

**16 mutations, 40 reds**, measured on the green tree, no survivors.

### Readings

> Ledger for `v3.144`.

| item | value |
| --- | --- |
| CI | run `45421625317` on `9a96f0be`: **8 of 8 jobs success**, 924 s, the run that published v3.143 and the thirty-sixth reading. No second attempt, so the history's only pair is still run `45351350110`'s |
| `pnpm run docs:check` | **23 steps, exit 0** |
| `core` test suite | **260 files, 6988 tests passed** (at v3.144) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.144) |
| repo test suite | **264 files, 7175 tests passed** (at v3.144) |
| new tests | **6,979 -> 6,988, +9**: three for the recorder's ordering (an older attempt refused, a newer one recorded and named, a recording that cannot be read refused in two shapes), two for seeds at an older and a newer attempt, and four for the ordering and the name themselves. Counted from the suite, not from this sentence |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged, because every line this round added is in `scripts/` and the instrument reads `src/` |
| the ordering's callers | **4**: the two sorts, `R10`'s two directions, and the recorder's block; `coordinateOf` gained **5** more sentences -- two report lines and three refusals that print both sides |
| the recorder's refusals | **5** in the block that decides whether a measurement may be written: older than the recording, newer than a seed's, equal to a seed's, a recording that does not parse, and one that names no run |
| the population | **36** readings, **35** runs, **34** trees; **1** run holds two measurements (`45351350110`, attempts 1 and 2, 356 s then 507 s) |
| the gate's inventory | **146** failure site(s) across 69 script(s); throws **16 fatal, 77 unguarded, 1 guarded, 10 rethrow** -- 104 partitioned, **236** proved claims |
| `docs/acceptance.md` | **58** clauses across **40** rounds; index **58** rows |
| the census | **4** coincidences, unchanged |

### Left open

- The recorder records a run that failed, and a step that expired spends exactly its bound: `R4` then
  compares the bound with the reading it just produced and demands twice it, so recording a timed-out
  run asks for the bound to be doubled by the run that failed inside it, while a step that failed in
  four seconds records four seconds. `O-127`.
  `[open: whether the recorder should refuse a conclusion other than success, or record it and say so
  in the file -- the seconds are the machine's either way, and `R10`'s denominator is the worst day
  rather than the greenest one -- and whether a step whose seconds equal its bound exactly is a
  reading or the bound read back as one]`

## v3.145 — a number the run did not measure, and the bound `R4` then asked to be doubled

`O-127` recorded two states: the recorder recorded a run that failed, and a step that expired spent exactly
its own bound. Both are one defect about **what a number in the recording means**. `R4` asks a bound to be
at least twice the number beside it, which is an argument only when that number is a duration the command
spent; a step killed at its bound reports the bound, so the rule compared a bound with itself and advised
doubling it -- a hang turning into slack.

### Three shapes, and what each one does to the gate

| the shape | what the number is | what `R4` then asks |
| --- | --- | --- |
| a step killed at its own `timeout-minutes` | the bound, read back | `bound >= 2 * bound` -- unsatisfiable while the step keeps timing out |
| a step stopped early (`cancelled`) | a lower bound on the command | a small bound, which every rule passes |
| a run that failed | the later steps never ran | a bound per step of a job the run did not finish |

### The population says it was latent

| fact | value |
| --- | --- |
| runs in the history | **36** |
| their conclusions, asked of the API one by one | **36 `success`** |
| bounded step-seconds in the history | **1,394** |
| equal to their bound / within 6 s of it | **0 / 0** |
| the recording's closest step | `verify / Lint (…)` at **531 s of 1080 s** |

So no shipped row is a non-duration, and the new refusals fire on the next red run somebody records --
which is the ordinary way a red tree is retried.

### The second question, answered as arithmetic

Whether a step whose seconds equal its bound is a reading or the bound read back: the latter, and the
reason is the direction of the inequality. **A step that ends on its own ends before its bound**, because
the bound is when the runner kills it. Two shapes produce the equality -- a kill whose failure was allowed
to pass, and a step finishing inside the last second of its allowance -- and no field separates them, so the
recorder refuses and names both plus the act. The rule is **not** `>=`: a number above today's bound is a
run measured before the bound was tightened, and that act is `R4`'s.

### The first question, answered asymmetrically

The recording is refused for any run whose conclusion is not `success`; a seed is not, and the difference is
what each file claims. A recording **describes this workflow**, and GitHub computes a run's conclusion from
its steps, so a green run is one in which every step that ran succeeded -- the per-step question would be a
branch that cannot fire. A seed **is a day the commands ran**, so a red day is appended with the numbers
that finished: `failure` kept (a command that ran and returned non-zero spent that long), `cancelled` /
`skipped` / no-conclusion dropped and named.

Two smaller shapes fell out of the same predicate: a skipped step was refused as one the job does not have,
which is false about the job; and a seeded job left with nothing said the tree had lost its steps whatever
the reason.

### The round's own defects

- **This suite's derived worker count is not safe in this container.** Three consecutive full runs at the
  derived three workers each failed four or five *different* files with `STACK_TRACE_ERROR` -- vitest's
  placeholder for a hook that timed out -- and collection alone took 336 s; at two workers the same suite
  was **7,183 of 7,183** green with collection at 10 s. CI's 4-vCPU runner is green at the same derived
  count, so the tree is not the variable and this container is: recorded as `O-129` with the numbers rather
  than papered over with a retry.
- **A hook that timed out reports as an error with no message.** The failure surfaces as
  `Error: STACK_TRACE_ERROR` against a test that passes alone, which reads like a broken subject; the
  message is the placeholder `withTimeout` installs, and only the hook's own budget explains it.
- **Two apostrophes in test names.** `it('… the gate's question …')` is a syntax error inside a
  single-quoted title, and both of this round's were written that way first: `Transform failed with 1
  error: Expected ")" but found "s"`, twice.

### Falsifications

| the mutation | reds |
| --- | --- |
| the recording is taken from any run, whatever it concluded | 1 |
| the conclusion rule applies to a seed as well | 5 |
| only `failure` is refused, so the conclusion a job timeout reports is recorded | 1 |
| a step that failed is read as one that did not finish | 2 |
| a step the report says nothing about is read as one that finished | 1 |
| an absent conclusion is read as success | 1 |
| a step whose seconds are its own bound is recorded | 1 |
| the equality is read as `>=` | 1 |
| the equality compares seconds with minutes | 1 |
| a borrowed number is held to the bound of the job that will enforce it | 1 |
| a step with no times is reported as one the job does not have | 1 |
| a seeded job left with nothing says the tree lost its steps | 1 |

**12 mutations, 17 reds**, measured on the green tree, no survivors.

### Readings

> Ledger for `v3.145`.

| item | value |
| --- | --- |
| CI | run `45445200416` on `61d433dd`: **8 of 8 jobs success**, 891 s, the run that published v3.144 and the thirty-seventh reading (`45393534319` is the thirty-fifth, `45421625317` the thirty-sixth) |
| `pnpm run docs:check` | **23 steps, exit 0** |
| `core` test suite | **260 files, 7000 tests passed** (at v3.145) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.145) |
| repo test suite | **264 files, 7187 tests passed** (at v3.145) |
| new tests | **6,988 -> 7,000, +12**: eleven for the recorder's three shapes (a red run refused twice over, a step above its bound accepted, an equality refused, one second inside it accepted, a skipped step, a red seed's kept and dropped steps, a seed step with no conclusion, a seeded job with nothing left, a borrowed number), and one for the two sorts of empty seeded job |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/`, and the instrument reads `src/` |
| the recorder's refusals | **3** new in the block that decides what may be written: a run that did not succeed, a step that never started, and a step whose number is its own bound -- beside one filter and two gap sentences |
| the gate's inventory | **146** failure site(s) across 69 script(s); throws **19 fatal, 77 unguarded, 1 guarded, 10 rethrow** -- 107 partitioned, **239** proved claims |
| the population | **37** readings, **36** runs, **35** trees; **1** run holds two measurements |
| `docs/acceptance.md` | **59** clauses across **41** rounds |
| the census | **4** coincidences, unchanged |

### Left open

- `O-128` · ~~**A step killed at its own bound in a red seed enters the history as the bound it was killed
  by.**~~ A seed keeps the steps that ended on their own, and the report calls a kill `failure`, so the seed
  path cannot separate it from a duration -- and the bound that was in force that day is not one the
  recorder reads, because it reads today's workflow. ~~`[open: whether the recorder should fetch
  `.github/workflows/ci.yml` at the seed's `head_sha` and compare each step's number with the bound in force
  then -- one request per seed, and a workflow from before a syntax change may not parse -- or whether a
  seed should keep only `success` steps, which would lose the slowest day of the command that failed]`~~
  **Closed by finding 649**: the first route, taken, and the second refused with a reason -- keeping only
  `success` steps would lose exactly the days a bound is sized from.
- `O-129` · **The worker cap is derived from the CPU count, and this container's derived count makes four
  files fail per run.** Two workers here is 7,183 of 7,183 green and three is four failures a run, which is
  a fact about this box rather than about the tree: the entry holds the numbers and the two ways to answer
  them.
  `[open: whether the cap should read measured contention (load average, or a collection-time budget)
  rather than only the CPU allowance, and whether the files that spawn processes should declare their own
  hook budgets instead -- the two are one question about where a machine's slowness is allowed to be
  answered, and neither can be decided from this container alone]`

## v3.146 — the bound a red day enforced, and the one it did not

`v3.145` closed `O-127` and left `O-128` standing with two routes: read `ci.yml` at the seed's `head_sha`,
or keep only `success` steps. The round took the first and refused the second, and the refusal is the
argument the round is built on.

### One conclusion, two shapes, and the field that does not separate them

`O-127` said a `failure` step of a seed is kept "because a command that ran and returned non-zero spent that
long". The first half is true and the second is only sometimes:

| the shape | what the number is | what `R10` then divides by |
| --- | --- | --- |
| the command ran to its end and returned non-zero | a duration | the worst day of the command, which is what the rule means |
| the runner stopped the step at its own `timeout-minutes` | the bound in force that day | a bound, so the multiple asks for a bound twice the number the run was killed by |

Why the second route was refused: a seed exists to keep a **red** day's numbers, because `R10`'s denominator
is the worst day rather than the greenest one. Keeping only `success` steps would delete exactly the days
the rule was written for, and would do it silently -- the file would look healthy with its slow rows gone.

### The arithmetic was right and the number in it was today's

`O-127`'s separation of a duration from a bound is *a step that ends on its own ends before its bound*, so
`seconds >= bound` means the number is that bound. The inequality is an argument only when `bound` is the
number the runner was enforcing. A seed's day is not today: `ci.yml` states today's bound, and that day's
`ci.yml` stated the one that killed the step.

So the recorder reads that day's file -- `GET /contents/.github/workflows/ci.yml?ref=<head_sha>`, walked by
the same line reader the gate uses on today's -- and holds each `failure` step to the bound it states:

| what that day says about the step | what the recorder does | why |
| --- | --- | --- |
| bounded at `N`, and the step spent at least `N * 60` s | drops it, naming `N` and *that day* | the number is that bound read back |
| bounded nowhere | keeps it | the job timeout cancels the running step rather than failing it, and a cancelled step is already dropped -- no step bound can have stopped this one |
| no such job in that day's workflow | drops it, saying which fact it is | the step may have run under a bound this reader cannot find, so the number cannot be proved a duration |
| the file cannot be read at all | refuses the seed | the question is open; a seed that answered it by guessing would append a day with its slow steps missing |

The last row is why the middle ones are not a compromise. The rule is not "keep what we cannot disprove",
it is "ask the day, and refuse when the day cannot answer". A refusal is a state a reader can act on.

### The cost, and who pays it

One request per seed, and only when the run holds a step the API called `failure` -- which a green run never
holds, because GitHub computes a run's conclusion from its steps. A seed of a green day costs what it always
did; the price lands on the red days, which are the days the question exists for.

### The population says the rule has never fired

| fact | value |
| --- | --- |
| readings in the history | **38** |
| runs they came from | **37** |
| those runs' conclusions, asked of the API one by one | **37 `success`** |
| step entries in the history | **3,134** |
| entries whose run holds a `failure` step | **0** |

So no shipped row can change under this rule. Its first real cost will be paid by the first red day somebody
seeds -- which is also the first day it saves.

### The mirror image, which was reachable

The equality check of `O-127` compared **every** run with **today's** bound, seeds included. A seed of a day
that allowed 30 minutes, of a step today's workflow bounds at 12, was refused when its seconds were exactly
720: today's bound read back, from a number that day had every right to spend. The check is the recording's
alone now, and the seed's version is the red-day comparison. Two relations, two bounds, one arithmetic.

### The round's own defects

- **A mutation that makes the subject unparseable measures nothing about the rule.** The first draft replaced
  `if (boundsThen === undefined) {` with `if (boundsThen === undefined) continue;`, which left the block's
  closing brace behind: 51 reds, and every one of them was a test that spawns the recorder failing to load
  it. A mutation battery that does not check the file still parses would report a rule as covered by the
  syntax error of a tool. The entry was rewritten as a whole-block replacement, and the honest count is 1.
- **An anchor copied by hand carried the wrong indent.** The base64 line sits at four spaces and the mutation
  was written with six, so the script printed `SKIP (anchor 0x)` -- which is the one failure mode a mutation
  battery can have and still look green, because a skipped mutation is not a surviving one.

### Falsifications

| the mutation | reds |
| --- | --- |
| a red seed keeps every failed step, whatever the bound of its own day was | 2 |
| the bound is compared with `>`, so a step that spent exactly it is kept | 1 |
| the seconds are held against today's bound instead of the one that day enforced | 2 |
| a job absent from that day's workflow is dropped without saying which fact it is | 1 |
| a day whose workflow cannot be read falls back on an empty map rather than refusing the seed | 2 |
| the day's workflow is fetched for every seed, not only one that holds a stopped step | 6 |
| a stopped step is one the API called cancelled, so no red day is ever read | 7 |
| the workflow of that day is read as text rather than decoded from base64 | 7 |
| a workflow this reader refuses is walked as far as it goes | 1 |
| a seed is held to today's bound as well, which is a different day's | 1 |

**10 mutations, 30 reds**, measured on the green tree, no survivors.

### Readings

> Ledger for `v3.146`.

| item | value |
| --- | --- |
| CI | run `45518129185` on `36a299c8`: **8 of 8 jobs success**, 909 s -- the thirty-eighth reading |
| `pnpm run docs:check` | **23 steps, exit 0** |
| `core` test suite | **260 files, 7007 tests passed** (at v3.146) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.146) |
| repo test suite | **264 files, 7194 tests passed** (at v3.146) |
| new tests | **7,000 -> 7,007, +7**: a red day's step at the bound it enforced (dropped), a step that spent today's bound while that day allowed more (kept), a day that gave the step no bound of its own (kept), a day whose workflow cannot be read (seed refused), a day whose workflow does not parse (seed refused), a green day that is not asked at all, and a step of a job that day's workflow does not have (dropped, with the fact named) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/`, and the instrument reads `src/` |
| the recorder's refusals | **2** new: a red seed whose day's workflow cannot be read, at the top level, and one this reader cannot walk, thrown from `boundsOfThatDay` |
| the gate's inventory | **146** failure site(s) across 69 script(s); throws **20 fatal, 78 unguarded, 1 guarded, 10 rethrow** -- 109 partitioned, **241** proved claims |
| the population | **38** readings, **37** runs, **37** trees; **1** pair measured one tree |
| `docs/acceptance.md` | **60** clauses across **42** rounds |
| the census | **4** coincidences, unchanged |

### Left open

`O-129` was measured once more and not closed: at the same derived three workers the full suite was
**7,007 of 7,007** green in 92 s, so the four failures a round are intermittent rather than necessary -- and
a rule that fires one run in four is not answered by a run in which it did not.

- `O-130` · **A seed whose commit predates a syntax this reader accepts can no longer be appended at all.**
  `workflowOfThatDay` walks that day's `ci.yml` with the same strict line reader the gate uses, and a shape it
  does not recognise is a refusal -- so a day from before a syntax change is unseedable, where `v3.145`
  would have appended it (with a bound it could not recognise). The alternative is a second, permissive
  reader for that day alone, which is a bound read by a rule no gate enforces. `v3.147` widened it: the
  request is made for every seed now, so a day this reader cannot walk is not just unprovable about a bound
  but unattributable about a command.
  `[open: whether a refused day should be appended with only its `success` steps -- which is the route
  `O-128` refused for a day it could read, and a different proposition for one it cannot -- or whether the
  reader should return the bounds it did recognise alongside its errors, so a day is refused for the steps
  it cannot place rather than as a whole]`
- `O-131` · ~~**A red day's bound is looked up by step name, and a step's identity in this file is its
  command.**~~ `boundsOfThatDay` keys that day's bounds by `step.name` and the recorder looks today's step up
  by the same name, so a step renamed between the two days -- the bound still managing the same command --
  reads as a step that day gave no bound, and a number equal to that bound is kept. Everywhere else a
  reading is keyed by `commandOf(step)`, because `R10`'s denominator is a series over commands rather than
  over names. ~~`[open: whether the lookup should key on the command, which is the identity the rest of this
  file uses, or keep the name and accept the gap -- a command match would also have to decide what two steps
  of one job that ran the same command mean, and a bound is one number while a command can be run twice]`~~
  **Closed by finding 650**: neither route, and the mechanism was not the one this entry described -- both
  sides of the comparison come from that day, so what was wrong was the attribution of the number to today's
  command, not the bound it was read against.

## v3.147 — the command beside the number

`v3.146` closed `O-128` and opened `O-131` with a mechanism: *the bound is looked up by step name*. The entry
was right that something crossed two trees and wrong about what. Both sides of that comparison come from that
day, so the bound *was* the bound of the step whose seconds were being read; what crossed the trees was the
**command**, and it crossed in the one place nobody was looking -- the field written beside the number.

### A reading is a pair, and only the recorder could keep it a pair

`R10` divides a bound by the slowest reading **of the command the bound bounds**, which is why the history
stores a command with every number (`commands[name] = commandOf(step)`) rather than a step name. The gate never
reads that command: it only divides. So the pair can only be broken by the recorder, and it was, on both paths:

| the path | where the number came from | where the command came from |
| --- | --- | --- |
| a seed | that day's report, looked up by step **name** | **today's** `ci.yml`, by the same name |
| a recording | the run's report | **whatever was on disk**, never compared with the run's commit |

A name is a label, and a label survives a change of the line under it -- the ordinary way a workflow moves.

### Two rows in the shipped history, not a hypothetical day

Asked of all **3,134** step rows against `.github/workflows/ci.yml` at each row's own commit:

| fact | before the repair | now |
| --- | --- | --- |
| step rows in the history | **3,134** | **3,217** |
| rows carrying the command their commit's file states | **3,132** | **3,217** |
| rows carrying another command | **2** | **0** |

| fact | value |
| --- | --- |
| trees in the history that differ from today's at a shared step name | **7 of 37** |
| (job, step) pairs that differ across those trees | **9** |
| steps today has that an older tree does not | **20** |

The two rows are runs `42131836805` (`7484b1a`, 626 s) and `42142175689` (`89775da`, 633 s), both the
`sensitivity` step, both recorded under `--shard 1/2` while the file at those commits runs the battery whole.
So shard 1's slowest day in the series `R10` divides read **633 s** where the slowest day a shard 1 spent is
**519 s**: its 25-minute bound was 2.4x a number no shard spent, where the honest reading of that series is
2.9x. Both rows are corrected; the numbers stay where they are, because they are the run's, and the command is
a fact about the commit.

Which path wrote them, the file cannot say: a seed and a recording taken on a moved tree produce the same two
fields, and no field records which tree a command was read from. That is why both paths are closed rather than
the likelier one.

### One document, two questions, in the order that matters

`boundsOfThatDay` -- a map of bounds, fetched only for a seed holding a stopped step -- is now
`workflowOfThatDay`, returning the parsed workflow, fetched for **every** seed and **every** recording.

| the relation | the questions, in order | what a disagreement does |
| --- | --- | --- |
| a seed | placement, then command, then bound | the step is dropped, naming which fact it is |
| a recording | is the disk the tree that ran (both directions) | refused before either file is written |

The order is the rule: a number and a bound that belong to another command are not a pair to compare at all,
so the bound question may not be asked first. A `--borrow` is not drift -- the borrowed job exists only on
disk by construction, and the entry says so in `derived`.

### The cost, restated

`v3.146` priced the request at the days holding a stopped step, and that price was right for the question it
asked. The attribution question is asked of every step, so every seed pays one request, and every recording
pays one -- two a round, against a run that costs sixteen minutes.

### The round's own defects

- **A rule that asks for a new document is a rule every fixture of the recorder has to answer.** The first full
  run failed six cases in `ci-readings.test.ts` and three in `ci-budget.test.ts` for a fixture reason -- no
  answer at the contents endpoint -- rather than for a rule. The harness now says once what the file at the
  run's commit is, and a case that needs another day answers for it.
- **A case whose fixture made the rule unreachable.** The renamed-job case of `v3.146` had one job; with
  placement required, nothing in it could be placed, so the seed was refused for sharing no command and the
  case measured the wrong sentence. It is two jobs now: one unplaceable and one that still lands.
- **A return value read from a file a refusal never writes.** The new fixture read the recording
  unconditionally, so three refusal cases failed with `ENOENT` -- a test failing for its own plumbing.

### Falsifications

| the mutation | reds |
| --- | --- |
| a step the day cannot place is attributed to today rather than dropped | 2 |
| a step that ran another command that day is attributed to today's command | 2 |
| the bound of the day is compared with `>`, so a step that spent exactly it is kept | 1 |
| a day whose workflow cannot be read falls back on today's file instead of refusing | 13 |
| the disk is never held to the tree the run used | 3 |
| the comparison is made only of steps the disk has, so a number the run measured is dropped in silence | 2 |
| the two trees are compared by step name rather than by the command the name runs | 1 |
| a job only the run has is skipped rather than refused | 1 |
| the job left with nothing does not say which facts it was | 1 |
| the check for the tree that ran is applied to the seed as well as to the recording | 3 |

**10 mutations, 29 reds**, measured on the green tree, no survivors.

### Readings

> Ledger for `v3.147`.

| item | value |
| --- | --- |
| CI | run `45531664638` on `3d69ada9`: **8 of 8 jobs success**, 992 s -- the thirty-ninth reading |
| `pnpm run docs:check` | **23 steps, exit 0** |
| `core` test suite | **260 files, 7014 tests passed** (at v3.147) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.147) |
| repo test suite | **264 files, 7201 tests passed** (at v3.147) |
| new tests | **7,007 -> 7,014, +7**: a recording whose disk runs another command (refused), one whose run measured a step the disk lacks (refused), one whose run measured a job the disk lacks (refused), a borrow that is not drift (accepted), a seeded step whose command that day was another (dropped), a seeded step the day does not place (dropped), and a seeded failed step asked about its command before its bound |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/` |
| the recorder's refusals | **1** new: a recording whose tree on disk is not the tree the run used. The two of `v3.146` changed sentences rather than count |
| the gate's inventory | **146** failure site(s) across 69 script(s); throws **21 fatal, 78 unguarded, 1 guarded, 10 rethrow** -- 110 partitioned, **242** proved claims |
| the population | **39** readings, **38** runs, **38** trees; **1** pair measured one tree; **3,217** step rows, all of them now carrying the command their own commit states, **2** of them corrected |
| `docs/acceptance.md` | **61** clauses across **43** rounds |
| the census | **4** coincidences, unchanged |

### Left open

`O-129` is unchanged and unmeasured this round: the worker cap and this container's contention are the same
question they were at `v3.146`, and nothing here touched it.

- `O-132` · **A step with no `run:` is identified by its name, so an action's version is invisible to the
  comparison.** `commandOf` answers `step:<name>` for a `uses:` step, which is the identity the history stores
  and the comparison this round added reads, so `actions/checkout@v3` and `actions/checkout@v4` under one name
  are one command. The steps affected are the prefix steps, which carry no bound of their own -- so no `R10`
  multiple divides by them today -- and the identity claim is weaker than the one the rest of the file makes.
  `[open: whether a `uses:` step should be identified by its action and version, which would give the history
  a series per version and split one step's readings across two, or keep the name and say in the file that an
  action's version is not part of a reading's identity]`

## v3.148 — an action is identified by the action

`v3.147` closed the pair -- a number and the command that spent it -- and left one row of the history whose
command was a **label**: a step with no `run:` was identified by its name, so `actions/checkout@v3` and
`actions/checkout@v4` were one command, and the entry it opened (`O-132`) offered two answers, both of which
kept the name.

### The entry's two answers were both wrong, for one reason

| the entry's option | what it does with `actions/checkout@v3` → `@v4` | what it does with a rename |
| --- | --- | --- |
| a series per version | splits the readings across two | keeps them -- correctly |
| say the version is not part of the identity | keeps them -- wrongly | keeps them -- correctly |

Each option is right about one movement and wrong about the other, and the reason is that the name is in both.
A name is a label, and the file's own thesis since `v3.147` is that a reading is a number beside the command
that spent it. The command of a `uses:` step is the action **and its version**; the name is the thing above it,
and it was doing the splitting in the first option and the merging in the second.

### 994 rows, and not one of them spent by another action

The history records its commit, so the file at each commit can be asked what the step ran. One request per
tree -- 39 trees, 40 readings:

| fact | value |
| --- | --- |
| step rows in the history | **3,300** |
| rows whose command is a step name | **994** |
| trees those rows were measured on | **39** |
| of the 994, rows whose own commit runs another action | **0** |

Latent, then, in the shape `v3.146` met with `failure` steps: no reading here was ever spent by another
version, and no bound divides by any of the 994 -- the first three actions are the prefix (`R14` forbids a
prefix step a bound of its own) and `actions/upload-artifact@v4` carries none. So the gate's summary after the
repair is unchanged to the second: the same 36 bounds, the same multiples, the same middles. That is the claim
rather than a coincidence -- what changed is whether the identity is true, not what any bound divides by.

### A mode, not a re-recording

`--relabel-actions` reads each reading's commit and replaces the command beside the number, and nothing else.
Three refusals make it safe: a row that names a step its commit does not have, a row that carries a command
its commit does not state (in either direction -- another action, or a name where the commit runs a command),
and a tree whose workflow cannot be read.

| the run | rows relabelled | trees read |
| --- | --- | --- |
| the first | **994 of 3,300** | 39 |
| the second | **0 of 3,300** | 39 |

The second run is byte-identical, which is the property that makes a rewrite of a committed file defensible:
the mode is also the audit that the history agrees with the trees it names.

### Two more places the identity reaches

**The prefix.** `sharedPrefixOf` has said "name and command both" since it was written, and it compared the
name and an empty string for every action step, because it read `run:` and an action has none. Two jobs at two
versions of one action are two things, and the shared run of setup steps now stops there.

**The recorder.** `v3.147` held the tree on disk to the tree the run used, and with the version in the identity
that comparison reaches actions: a run whose step used `@v3`, recorded against a tree at `@v4`, is drift. The
step keeps its name, its position and its inputs, so nothing else in this repository could have seen it.

### What it does not claim

An action's `with:` block is not part of the identity. This workflow holds the pair that leaves pooled:
`backend / Check out` clones shallow, the other seven clone the full history, one series. The choice errs in
`R10`'s direction -- pooling makes the denominator the slower of the two shapes -- and it is the answer the
file already gave for `env:` on a `run:` step. A local action (`uses: ./x`) is the residual: the workflow names
a path and not the bytes behind it, and nothing here uses one.

### The round's own defects

- **A mutation survived the case written to kill it.** "The file is written even when nothing was relabelled"
  left the suite green, because the idempotence case wrote its fixture in the same two-space layout the mode
  writes: *left alone* and *rewritten identically* were the same bytes. The fixture is compact now, and the
  mutation dies.
- **A refusal with an unreachable half.** The first draft refused a row when its command was not a step name
  **or** when its commit's command was itself a step name -- and the second clause could not be reached,
  because the equality test above it had already continued. The case that needs the refusal is a row naming a
  step where its commit runs a **command**, which no recorder in this tree ever wrote.
- **A usage text moved into a constant and the inventory noticed.** Two `process.exit(2)` sites sharing one
  usage string is one string in the source and no `diagnostic` at either site, which
  `gate-sites-are-proven.test.ts`'s fifth rule refused. The two checks are one refusal now -- token, or a run
  id that is not the mode -- so the site count did not move and the sentence is written once.

### Falsifications

| the mutation | reds |
| --- | --- |
| an action step is identified by its name again, so a version bump is invisible | 8 |
| the prefix compares a name and an empty string for every action step | 1 |
| the action a step uses is not carried out of the reader | 6 |
| the history is rewritten without asking what each row's commit states | 2 |
| a row that names a step where the commit runs a command is rewritten instead of refused | 1 |
| the file is written even when nothing was relabelled | 1 |
| a row no tree can place is carried rather than refused | 1 |
| a tree whose workflow cannot be read is walked as an empty tree | 4 |
| the mode is not a mode: the flag is parsed and never branches | 7 |
| the mode takes a measurement and ignores it | 1 |

**10 mutations, 32 reds**, measured on the green tree, no survivors. The seven new claims -- the usage site
with its second clause, and the mode's six throws -- are 7 of 7 credited by the sensitivity battery.

### Readings

> Ledger for `v3.148`.

| item | value |
| --- | --- |
| CI | run `45545113405` on `91806080`: **8 of 8 jobs success**, 744 s -- the fortieth reading |
| `pnpm run docs:check` | **23 steps, exit 0** |
| `core` test suite | **260 files, 7026 tests passed** (at v3.148) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.148) |
| repo test suite | **264 files, 7213 tests passed** (at v3.148) |
| new tests | **7,014 -> 7,026, +12**: four on the identity (a `uses:` step keyed by its action, two versions as two series, a rename that keeps its series, a prefix that stops at a version) and eight on the mode (a row given its action, a second run that writes nothing, an unplaceable row, a row that contradicts its commit, a history that cannot be parsed, one with no reading, a commit whose file cannot be read, and a flag given a measurement) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: the round's code is in `scripts/` |
| the recorder's refusals | **6** new: five in the mode, and one at the top level for a mode given a measurement |
| the gate's inventory | **146** failure site(s) across 69 script(s); throws **22 fatal, 83 unguarded, 1 guarded, 10 rethrow** -- 116 partitioned, **248** proved claims; 166 exit calls, of which 20 are zero |

### Left open

`O-130` is unchanged: a day whose workflow this reader cannot walk is still unseedable as a whole, and the
round that closes it has to decide whether the reader returns the bounds it recognised alongside its errors.
It is the next P1 on the path, and the mode this round added does not touch it -- a seed is a measurement and
the mode measures nothing.

- `O-135` · **A reading cannot say whether it measured a slow program or a slow machine.** A recording's seconds
  are the denominator every future bound is a multiple of, and no field says what else the machine was doing.
  This round's own delivery run is the case: 8 of 8 jobs green, the sites battery's second shard at **717 s**
  against a fastest reading of 519 s, on a shared box at load 5.6 with a four-CPU quota -- so recording it
  would have asked `R4` to raise a 22-minute bound for a reason that is not the program's, and it was not
  recorded. That decision is unreadable from the file: a run that is absent looks like a run that never
  happened. `[open: whether a reading should carry the evidence that would separate a slow program from a busy
  box -- the runner's own timestamps, a load average the recorder reads beside the job, or the same step
  measured twice on one tree -- or whether the rule should stay "the slowest day wins" and the recorder should
  refuse a reading taken while another measurement was running on the same machine]`

`O-126` (an install step whose bound depends on which of two modes ran) and `O-108` (the two `lint` spawners)
are unchanged and unmeasured here for the same reason: both need a run whose shape this round did not produce.

The one entry this round opens is the limit of the identity it just made true:

- `O-133` · **A local action is identified by its path, so a change to the action's own code is invisible to
  the comparison.** `commandOf` answers `uses:./x` for a local action, and the workflow names a path rather
  than the bytes behind it, so an edit to that action moves the program without moving the identity -- the
  shape `O-132` closed one level up, where a remote action's reference at least changes when the program does.
  Nothing in this workflow uses a local action, so no reading is affected today.
  `[open: whether a local action's identity should carry a digest of the files behind it, which no reading of
  `ci.yml` can supply -- the identity would then have to be written by something that reads the tree -- or
  whether a step whose `uses:` names a path should be refused a bound outright]`

## v3.149 — a day is refused for the steps it cannot place

`v3.148` closed the identity of a reading and left `O-130` open with two answers: append a refused day with
only its `success` steps, or let the reader return the bounds it did recognise so a day is refused **for the
steps it cannot place** rather than as a whole. The first answer was refused at `v3.145` for a day the reader
*can* read -- a seed that keeps only the steps it likes deletes the slow steps of the day, which are the
denominator `R10` divides by. This round took the second, and found that the second is only sound with a floor
underneath it.

### The floor: a line no rule consumed

The reader walks two ways -- a job-and-step scan, then a key-and-block scan per step -- and both used to leave
lines they did not recognise **alone**. A `timeout-minutes:` written with one space too many matched no rule,
so the bound was silently absent, and the day was appended with a step that could have been killed at that
bound reading as a duration the command spent. Measured on the shipped file:

| the file | steps with a bound of their own | what the reader said |
| --- | --- | --- |
| `.github/workflows/ci.yml` | **38** | nothing |
| the same file, one bound moved one space left | **37** | nothing, before this round |

The second row is the defect: one bound disappeared from the reading and no sentence said so. The reader now
records every line a rule consumed and refuses the ones none did, at a step's indent or above -- ten spaces and
deeper is block body (`run:` bodies, `env:` entries, `with:` values), and none of that can be a bound. The
same file now answers with one refusal that names the line, the job, and the spelling it reads.

The floor is what makes the scopes sound. "No refusal for this job" has to mean "every line of this job was
understood", and until this round it meant "this reader did not look".

### Two scopes, because a doubt spreads as far as the fact's dependence

The reader's `refusals` carry the same sentences as `errors`, with the thing each one poisons:

| scope | what it covers | what a caller may still use |
| --- | --- | --- |
| `file` | no `jobs:`, a step before any job, zero steps | nothing: there is no job to place a step in |
| `job` | an unknown key at four spaces, a refused one, a job `if:` that narrows, a `- ` with no `name:` | every other job |
| `step` | neither `run:` nor `uses:`, a `run:` block with no body, an `env:` entry with no name | the step's neighbours |

A **seed** asks one question per number -- which command spent it, and what bound could have stopped it -- and
both are facts about that step's own lines, so a job this reader could not finish costs that job's steps and
nothing else. A **recording** asks whether two trees are one, which is a question about **both**, so it is
refused whole.

That asymmetry is also a repair. A job the reader could not describe is *absent* from the day's map, and an
absent job is exactly what a job the run did not report looks like -- a state `driftOf` tolerates on purpose.
So before this round the unreadable job was the one place a drift could sit unseen. It is now the first thing
the comparison returns, ahead of any pair it would otherwise have compared.

### What the floor says about this repository

Nothing. The mode that reads every tree the history names was run again with the floor in place -- 40 readings
on 39 commits:

| fact | value |
| --- | --- |
| trees read | **39** |
| trees holding a line the floor refuses | **0** |
| rows that had to be relabelled | **0 of 3,300** |
| the file | not written: nothing changed |

So the floor refuses no day this project has ever recorded, and the scopes cost no reading its numbers.

### What it does not claim

The floor reads one spelling -- a step at six spaces, its keys at eight, a block body at ten -- and it now says
so when the file is written another way instead of misreading it. A file whose steps are at eight spaces is
refused, where before it was quietly one step shorter. Whether that boundary should be removed by reading YAML
indentation in general is a different round with a different cost, and it is `O-134`.

A day whose **file** cannot be placed at all is still unseedable. That half of `O-130` is not a defect: with no
`jobs:` block there is no job whose command a number could be placed on, and no sentence a seed could write.

### The round's own defects

- **A body consumed only for the keys that were tolerated.** The first draft read the six-space body of a
  four-space key only after the key had been accepted, so `strategy:` -- refused -- had its `fail-fast:` body
  read as a step and the job answered with two refusals where the rule is one. The case that pins *one*
  refusal found it; the body is now consumed before the key is judged, because a refused key's body is not a
  step either.
- **A mutation harness that measured its own environment.** The first battery passed a hand-built environment
  to the child instead of inheriting one, and under it a dozen tests in a *different* file reported red for
  every mutation of the recorder, including mutations they do not touch. The same mutation, run with the
  parent's environment, gives one red -- the test that names the claim. The published counts are the second
  measurement, and the first is recorded here because a number measured through a harness nobody checked is
  the shape this repository keeps finding.
- **A sentence that promised more than the reader knew.** The mode's new refusal first said "the tree holds the
  step, and this reader cannot read it"; for a *job*-scoped refusal the reader never reached the step. It says
  "the part of that tree that holds it" now.

### Falsifications

| the mutation | reds |
| --- | --- |
| a job refusal reaches the whole file | 9 |
| a step refusal reaches its whole job | 3 |
| the floor is gone: a line no rule consumed is skipped again | 3 |
| the floor also refuses the body of a block, which is not a step | 26 |
| the body of a job key is read as steps, so `permissions:` poisons the job | 31 |
| the sentences are no longer the refusals, so a caller prints nothing | 6 |
| a day with any refusal is refused whole, as before | 5 |
| a job this reader refused is placed anyway, from the lines it did read | 2 |
| the comparison ignores what the reader could not read, the way it did before | 1 |
| a row the reader could not reach is refused without saying why | 1 |

**10 mutations, 87 reds**, measured on the green tree, no survivors.

### Readings

> Ledger for `v3.149`.

| item | value |
| --- | --- |
| CI | run `45545113405` on `91806080`: **8 of 8 jobs success**, 744 s -- the fortieth reading, and the one `R7` compares the recording with |
| `pnpm run docs:check` | **23 steps, exit 0** |
| `core` test suite | **260 files, 7040 tests passed** (at v3.149) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.149) |
| repo test suite | **264 files, 7227 tests passed** (at v3.149) |
| new tests | **7,026 -> 7,040, +14**: nine on the reader (the control, an unknown key, the three keys that decide a job's step list, a nameless step, the three step-scope shapes, the whole-file shapes, a bound one space off, a step one indent deep, and the two bodies the floor must leave alone) and five on its two callers (a recording refused for a job and for a step, a seed that loses one job, a seed that loses one step, and a row the mode refuses with the line named) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/` |
| the gate's inventory | **146** failure site(s) across 69 script(s); throws **22 fatal, 83 unguarded, 1 guarded, 10 rethrow** -- 116 partitioned, **248** proved claims; 166 exit calls, of which 20 are zero |

**Why the round's own run is not the row.** The first run of the tree this round ships is green -- 8 of 8 jobs -- and it is
the tree this round ships. Its seconds are not recorded as a reading, and the reason is measurable rather than
convenient: the machine was at load 5.6 with a four-CPU quota for the whole run, the sites battery's second
shard spent **717 s** where the fastest reading of it is 519 s, and `R4` would then ask for a 23-minute bound
where 22 is now. A recording is the denominator every future bound is a multiple of, so a contended machine's
measurement would raise every bound in the file to cover a busy box. The round that records this run will do so
against its own day; the question the refusal exposes -- a reading cannot say whether it measured a slow
program or a slow machine -- is `O-135`.

### Left open

`O-126` (an install step whose bound depends on which of two modes ran) and `O-108` (the two `lint` spawners)
are unchanged and unmeasured here for the same reason as last round: both need a run whose shape this round did
not produce. `O-133` (a local action identified by its path) is unchanged.

The entry this round opens is the boundary the floor made visible:

- `O-134` · **The reader is a line scanner for one spelling, so a workflow written another way is refused
  rather than read.** A step at eight spaces, a key at seven, a bound at six: each is now named by the floor
  instead of being skipped, which is the repair -- but the repair for the *day* is still "this file cannot be
  read", and a repository that one day indents its steps differently would find its history unseedable rather
  than its reader wrong.
  `[open: whether the reader should become an indentation-aware parser, which reads any consistent spelling
  and can then say which lines it still cannot place, or whether one spelling should stay the contract with
  the floor as the enforcement of it -- the second is what this tree can hold to account today, and the first
  is a rewrite of the reader every gate but one depends on]`

## v3.150 — a tree costs the faster of its attempts

`v3.149` closed `O-130` and left `O-135` open with three candidate answers: a reading could carry the runner's own
timestamps, a load average the recorder reads beside the job, or **the same step measured twice on one tree** --
"the only form of the question this file already knows how to ask". This round took the third, and the arithmetic
it exposed is the one the previous round's prose got wrong.

### The numbers the last round reported, corrected

`v3.149`'s entry says the sites battery's second shard "spent **717 s** where the fastest reading of it is
**519 s**". Both figures are wrong, and the second is wrong in the way this file is a campaign against:

| what the paragraph said | what the recording holds |
| --- | --- |
| the second shard spent 717 s | **881 s** (`sensitivity-shard / Every proved exit… (shard 2 of 2)`, run 45595594712 attempt 1) |
| the fastest reading of it is 519 s | **285 s** (run 44656781771); 519 s is a reading of the *first* shard's step, in run 45345210544 |

519 is a real number and it belongs to the other series, so the sentence compared one command's slow day with
another command's fast one -- the defect `R10` was written to remove, in prose rather than in arithmetic. The
series the bound was actually sized from held 40 readings before this round: **285 s** at its fastest,
**481 s** in the middle, **881 s** at its slowest. The round that read 519 as its own made a 47% gap look like a 38% one.

### The question, and the only instrument that can answer it

A recording's seconds become the denominator every future bound is a multiple of, and 881 s against a 22-minute
bound is 1762 s of requirement against 1320 s of bound: `R4` and `R10` both refuse it. The question is whether
881 s is the **program** or the **box**, and the file has exactly one instrument that can tell them apart -- the
same commit measured twice. Nothing else can: a range over the history mixes the tree's growth with the
machine's state, and neither a timestamp nor a load average says what the *same work* would have cost on a quiet
box.

So the delivery run was re-run, which GitHub numbers as attempt 2 of the same run id, and the recorder was given
`--attempt`:

| | attempt 1 | attempt 2 | the second shard | the first shard |
| --- | --- | --- | --- | --- |
| shard 2 of 2 | 881 s | **880 s** | the tree, twice | |
| shard 1 of 2 | 501 s | **418 s** | | 17% apart, same tree |

The pair agrees to a second, and the sibling shard moved 17% in the same window. Read at the time, that says the
second shard's cost is the **work** and the first shard's movement is the machine, and the honest bound is twice
880 s. Read with the measurement this round ended on -- one section below -- it says something weaker, and the
difference is the round's own finding about its own instrument.

### The fourth and fifth measurements, and the argument they took back

The trees this round delivered ran their own CI, and the battery was measured twice more:

| the second shard | run | tree | seconds |
| --- | --- | --- | --- |
| attempt 1 | 45595594712 | `87d78d97` | 881 |
| attempt 2 | 45595594712 | `87d78d97` | 880 |
| the first delivery run | 45615317655 | `b3124638` | **621** |
| the second delivery run | 45621022185 | `8fb87bcb` | **900** |
| three earlier readings | 44516888528, 45518129185, 45531664638 | three trees | 629, 635, 636 |

Read as a series, the step has **two modes**: five readings between 600 and 636 s, three between 880 and 900 s.
Neither mode is the tree's growth -- two trees land in the fast one and two in the slow one, and the second
delivery tree differs from the first only in documentation -- so the modes belong to the machine, and the
pair's agreement is explained by both attempts falling in the same mode forty minutes apart. A re-run inside one
mode reproduces the mode; it does not measure the program.

So the sentence this round had already written into three documents -- that the pair ruled the box out -- is
withdrawn, and what takes its place is more useful than the claim was:

- **`R14`'s multiple divides the fast mode.** 1800 s of bound against 621 s is 2.9x, which is the room the round
  noticed and could not explain.
- **The floor clause is what makes the bound correct.** A bound under a day already spent is not a bound, and
  30 minutes is exactly twice the slow mode's 900 s. Without clause 3 the multiple alone would have asked for
  22 minutes, and every slow-mode run -- three of the eight samples here -- would have been refused for being
  slow rather than for hanging.

That is the round's real result, and it is the opposite of the one it set out to report: the clause that had
been doing nothing for twenty rounds is the clause that makes this arithmetic safe, and the instrument it was
written around -- a second measurement of the same tree -- cannot tell a program from a mode. What the file
still cannot say is that a step *has* modes, so a reader comparing 22 minutes with 621 s and with 900 s has no
way to know which number a bound should be argued from. That is `O-139`.

### `R14`: a tree costs the faster of its attempts

The rule the pair was read as justifying, and the three clauses it needs to be safe -- of which the third is
the one this round measured the value of:

1. **A tree measured more than once costs the faster attempt.** The tree cannot have changed between two
   attempts of one commit, so the difference is the machine, and a bound is a multiple of the program.
2. **One attempt that ran the command in two jobs costs the slower job.** This is `R10`'s original evidence --
   the install step at 153 s in one job and 8 s in another, because its cost belongs to a package mirror. The
   minimum is taken *across attempts of one tree*, never across the jobs of one attempt.
3. **A bound is also at least the worst day the command has already spent.** The clause had been doing nothing
   while the multiple divided the slowest reading, and it starts to matter the moment the multiple stops: a
   command with two modes -- a package store hit at 10 s, a miss at 109 s (`O-126`) -- has a faster attempt that
   is the cheap mode, and twice a cheap mode is not a bound on the expensive one.

The words changed with the arithmetic. `R4` said "measured 351 s" and says "the tree spent 351 s on it"; `R10`
said "took 361 s in" and says "cost 361 s on the slowest tree that ran it, in", with the other attempt's number
in the same sentence when there is one. A refusal that printed only the chosen number would leave a reader who
has seen 881 s in the history believing the gate had ignored it.

### What the rule does to this tree

| | before | after |
| --- | --- | --- |
| the sites battery's bound, both shards | 22 min | **30 min** (twice the slow mode's 900 s is 1800 s) |
| `sensitivity`'s ceiling | 35 min | **43 min** (39 min of bounds plus the 3-minute prefix allowance) |
| `sensitivity-shard`'s ceiling | 34 min | **42 min** (38 plus 3) |
| bounds in the file | 247 min | **263 min** |

The recording of the pair is run 45595594712 attempt 2: **8 of 8 jobs success**, 880 s of the second shard and
418 s of the first. Attempt 1 was seeded beside it, because the history is where the pair lives. The recording
the round ships is the second delivery run, `45621022185`: **8 of 8 jobs success**, 900 s of the second shard
and 482 s of the first.

### Why the battery costs 621 s in its fast mode, which is the finding under the reading

The modes are the machine, and the battery's *price* is the number inside a mode. Both shards were compared
across runs that landed in the same one:

| | claims | runs | wall clock | seconds per run |
| --- | --- | --- | --- | --- |
| the second shard, run 45545113405 | 123 | 157 | 600 s | 3.82 |
| the second shard, run 45615317655 | 129 | 163 | 621 s | 3.81 |
| the first shard, same two runs | 119 | 153 | 486 s -> 505 s | 3.18 -> 3.30 |

Six claims were added between those runs, all of them throws, all of them in `measure-ci-baseline.mjs` (five
proved by `ci-budget.test.ts`, one by `ci-readings.test.ts`). Run count rose 4% and wall clock rose 3.5% -- six
claims at **3.5 s each**, an average claim's price and not a defect. `v3.149` read a +282 s difference between
two afternoons as those six claims; both later measurements say it was the mode.

The price is still worth naming, and the cost model says why: a claim runs **its whole test file**, not the test
that proves it -- `verify-sites-are-sensitive.mjs` spawns `vitest run <file> --maxWorkers=1`, because the file is
the witness and nothing in the inventory names a test. `ci-budget.test.ts` holds 30 of the 248 claims and takes
12 s of a 32-CPU box; thirty-one runs of it are **372 s of the fast mode's 621 s**, and the other 118 claims
share the remaining 249 s. Whatever makes a run take 900 s makes those thirty-one runs dearer faster than the
rest, which is the second reason to charge a claim to itself (`O-136`, `O-137`).

### Not claimed

That a repeated reading separates the program from the machine. This round claimed it and then measured it away:
the pair agreed to 0.1%, and two later trees landed 279 s apart from each other. Two attempts of one commit are
one sample of the machine when they are forty minutes apart, which is what a re-run is.

Nor that 880 s is wrong as a *day*: it was spent, it is in the history, and `R10` divides by it. What the round
cannot say is which mode a bound should be argued from, because nothing in the file records that a step has
modes -- that is `O-139`.

**The floor clause was believed to be unexercised, and it is not.** Twenty rounds of entries said no command here
had two modes; the sites battery has two, and this round shipped the clause that covers the slow one without
knowing it was doing so. Its fixture -- 1300 s and 600 s on two attempts of one tree, a bound of 20 minutes that
the multiple clears and the day does not -- is now a simplification of a shipped case rather than a hypothetical.

### Readings

> Ledger for `v3.150`.

| item | value |
| --- | --- |
| CI | run `45621022185` on `8fb87bcb`: **8 of 8 jobs success**, 978 s -- the forty-third reading, and the tree this round ships; run `45615317655` on `b3124638` is the forty-second (921 s), run `45595594712` on `87d78d97` the forty-first (attempt 2, 907 s) with attempt 1 (911 s) seeded beside it; the history holds **44** readings over **42** commits |
| `pnpm run docs:check` | **23 steps, exit 0** |
| `core` test suite | **260 files, 7050 tests passed** (at v3.150) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.150) |
| repo test suite | **264 files, 7237 tests passed** (at v3.150) |
| new tests | **7,040 -> 7,050, +10**: nine on the arithmetic (one tree's two attempts read as one cost, one attempt's two jobs taken at the slower, the slowest tree rather than the slowest attempt, a bound twice the faster attempt accepted, the same bound refused when the tree was read once, the recording's number against the tree's cost, the floor clause, the sentence naming the other attempt, and the two shapes of a lookup that answers nothing) and one on the summary |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/` |
| mutation | **10 groups, 62 red cases, 0 survivors**, each measured on the green tree and restored byte for byte |
| the gate's inventory | **146** failure site(s) across 69 script(s); throws **22 fatal, 83 unguarded, 1 guarded, 10 rethrow** -- 116 partitioned, **248** proved claims; 166 exit calls, of which 20 are zero |

### Left open

`O-126`, `O-133`, `O-108` and `O-134` are unchanged. `O-135` is closed by finding 653, and four entries come out
of the round -- two about the battery's price, one about a tree measured once, one about the modes the closure
turned out not to explain:

- `O-136` · **A claim costs its whole test file, so the battery's price is claims times file, not claims times
  test.** `ci-budget.test.ts` holds 30 of the 248 claims and takes 12 s of a 32-CPU box; thirty-one runs of it
  are 372 s of the second shard's 882 s. No claim names a test -- `provedBy` is a file -- so a run cannot be
  narrowed to the test that goes red, and the six throws added in `v3.148` cost 47 s each.
  `[open: whether a claim should carry the test that proves it, so the battery can run one test rather than one
  file -- an inventory change that `derive-gate-sites` would have to write and every claim would have to
  survive -- or whether the mutant runs should take `--bail`, which stops at the first red and changes nothing
  for a survivor, since a survivor's verdict is the whole file staying green]`
- `O-137` · **The battery publishes claims, runs and wall clock, and no per-run seconds.** The +282 s this round
  attributed to six claims is a difference between two afternoons, not a measurement of the six runs: the
  battery prints one summary line, and the recorder only ever sees the step's total.
  `[open: whether the battery should write its own per-run seconds beside the summary, so the next claim added
  can be charged to itself, or whether the step's seconds plus the run count are enough and the arithmetic
  belongs in the round rather than in the instrument]`
- `O-138` · **A tree measured once is still priced from one afternoon.** `R14` prices a tree by the faster of
  the attempts that measured it, which is an answer only when there are two, and `v3.150`'s re-run was the
  manual form of the instrument. A reading that nobody re-ran is still written down as its tree's cost, so a
  commit measured once on a contended box raises every future bound for a load no future run has to carry.
  `[open: whether `measure-ci-baseline.mjs` should refuse to write a reading that no second attempt of the same
  commit corroborates -- which doubles the cost of every delivery run and of every seed -- or whether a re-run
  should stay the answer for the readings that move a bound, with the recorder printing which of its history's
  trees were measured once, so a reader can see the size of the population instead of taking the round's word
  for it]`

- `O-139` · **A step with two modes is one series, and nothing in the file says which mode a bound is argued
  from.** The sites battery's second shard reads **621 s** in its fast mode and **900 s** in its slow one -- five
  readings between 600 and 636, three between 880 and 900, on four different trees -- so the 30-minute bound is
  exactly twice the slow mode and 2.9x the fast one. `R14`'s multiple divides one tree's fast attempt and the
  floor clause covers the slow one, so the arithmetic lands in the right place for a reason no reading records:
  a reader comparing 22 minutes with 621 s cannot know that 900 s is what makes 22 unsafe.
  `[open: whether a reading should record the mode it landed in -- which needs an instrument that measures the
  machine rather than the program: a load average read beside the job, the runner's own timestamps, or a second
  measurement far enough away in time to be another draw -- or whether the multiple should divide a statistic
  over the command's series (the middle, or the fast mode by construction) with the floor clause carrying the
  slow one, which is a change to `R4`, `R10` and the summary at once]`

## v3.151 — a bound covers the state the command was read in

`v3.150` shipped a rule and three documents that called a bound unsafe, and the rule agreed with neither of them.
`R14` divided a tree's **faster** attempt; the sites battery's second shard had been read at 621 s and at 900 s;
a 22-minute bound is 1320 s, which is above twice 621 s (1242) and above the 900 s day itself, so **both** of
`R14`'s clauses passed it. The round's prose said 22 minutes was unsafe. The gate returned an empty list of
errors, and nothing in the tree could see the two disagree.

That is finding 654, and this round is the measurement it took plus the rule it forced: a bound divides the
worst day the command has spent, and the attempts of that day's own tree travel beside the number as evidence
rather than as a second candidate for it (`R16`).

### The falsifier, which is one assertion in one test

The claim "the gate accepted it" is checkable, so it was checked first. A workflow with one bounded step at 22
minutes, a recording of that step at 621 s, and a history holding 621 s and 900 s on one tree: under `R14` the
error list is `[]`, and under `R16` it is one refusal naming the 900 s day. The test is the falsifier, and it was
run against a reconstructed `R14` before the rule changed -- `expected '' to contain 'is bounded at 22 min'`,
which is the defect stated as an assertion rather than as a paragraph.

The reconstruction is four lines: `readingsOfCommand` reporting the worst tree's **cheapest** attempt instead of
its worst day. Nothing else about the measurement changes.

### What the history holds, read at the commit rather than at the round

`v3.150` read the step's series as two modes and, in the same round, took 621 s and 900 s for two states of one
tree. Both readings are in the file, and their commits are not the same one:

| tree | readings | seconds | sites at that commit |
| --- | --- | --- | --- |
| `36a299c8` | 1 | 635 | 146 |
| `3d69ada9` | 1 | 636 | 146 |
| `91806080` | 1 | 600 | 146 |
| `87d78d97` | 2 | 881, 880 | 146 |
| `b3124638` | 1 | 621 | 146 |
| `8fb87bcb` | 1 | 900 | 146 |
| `90303700` | 1 | 885 | 146 |

Seven trees of one afternoon, and **146 sites at every one of them** -- read from `golden-master/gate-sites.json`
at each commit through the API, not remembered from a round. The shard runs one test file per claim, so an
identical site list is an identical workload, and the 50% between 600 and 900 is not the suite's growth.

The other jobs of those runs say it is not a slow box either: the 900 s run reads **482 s** in the first shard
and **728 s** in `verify`, inside the 378--505 s and 537--769 s the same seven runs span.

The eighth measurement is the one this round took, and it is the tree `v3.150` shipped (`90303700`, run
`45626206585`): **885 s** in the second shard, **480 s** in the first and **518 s** in `verify`. So the slow
state is not two trees but four, and the bound's 1800 s is 2.03x the day the recording now holds.

And the one tree measured twice read **881 s** and **880 s** -- one second apart, forty minutes apart. So a tree
repeats its own state, and `R14`'s own evidence was the wrong half of its argument: two attempts of one commit
*cannot* differ by the tree, which is true, and *so the tree costs the fast one*, which does not follow. A state
a legitimate run lands in is part of what the command costs, and a bound sized from the fast state refuses the
slow one.

### `R16`: one clause where two were doing one job

| rule | the number a bound divides | the pair |
| --- | --- | --- |
| `R4` at `v3.150` | what the recording's tree costs, as its faster attempt | printed |
| `R10` at `v3.150` | twice the slowest tree's faster attempt, **and** the worst day already spent | printed |
| `R4`/`R10` at `v3.151` | **the worst day the command has spent** | printed |

The floor clause is gone as a clause because its subject became the multiple's: a rule that needs a second
clause to cover a day the first one was sized past is one rule that was reading the wrong number. What survives
of `R14` is the pair -- for the number, not instead of it -- on the reading that carries the worst day, and in
both sentences that print it.

Three sentences changed with the arithmetic, and each is a claim a reader can check:

- `R4`: "the tree spent 400 s on it (the same tree read 881 s on its other attempt): the bound is under 2 times
  what the command costs on that tree";
- `R10`: "spent 900 s on its worst day, in `sites / ...` in run 45595594712 attempt 2 (the same tree read 621 s
  on its other attempt)";
- the summary: "2.0x of the worst day its command has spent (540 s in ...)" beside "; the same tree was read
  again at 880 s (run 45595594712 attempt 1), 1 s apart".

### What the rule does to this tree: nothing moves

All 38 bounded work steps were replayed under both rules against the 44 readings, and **0 change verdict**:

| step | bound | worst day | the multiple | `R14` would divide |
| --- | --- | --- | --- | --- |
| `sensitivity-shard / ... (shard 2 of 2)` | 1800 s | 900 s | 2.0x | 900 s |
| `sensitivity / ...` | 1800 s | 519 s | 3.5x | 519 s |
| `backend / Install a backend ...` | 1800 s | 888 s | 2.03x | 888 s |
| `verify / Lint ...` | 1080 s | 540 s | 2.0x | 540 s |

That is not a coincidence and it is the round's other reading: the two rules agree **wherever no tree has been
read in two states**, which is everywhere in this history -- the one tree read twice read 881 s and 880 s. So the
change costs no bound, and what it buys is the case that has not happened yet: a tree read in both states would
have had its bound divided by the cheaper one.

### The sentence `O-139` asked for

`O-139` asked which mode a bound is argued from, and said a reader comparing 22 minutes with 621 s cannot know
that 900 s is what makes 22 unsafe. The rule now refuses 22 minutes, so the first half is answered by the verdict.
The second half is a sentence, because a reader of a green run has no refusal to read:

> ...across the history that command runs from 221 s to 540 s, with the middle of its 44 readings between 404 s and
> 411 s -- against which the bound is 3x; **two readings of one tree timed that step 141 s apart, 44% of the 319 s
> between its ends**...

For the sites battery the same clause reads `1 s apart, 0% of the 615 s between its ends` -- the widest
difference two readings of one tree have shown, as a share of the range it is being compared with. A share and
not an adjective: whether the rest of the range is growth or a state is not separable by arithmetic on the file,
and the sentence does not pretend to know. Three states, three sentences, and a step no tree has been read twice
on says *that* rather than printing a difference of zero it never measured.

### Its own defects

- **The numbers in the new test file's docblock will rot.** Six trees, six site counts, one pair -- copied from
  the history into a comment, which is finding 202's shape. The corpus dates such tables; a test file has no
  gate that reads one.
- **Two clauses name two different pairs, and the sentence does not say so.** `replicatedText` compares the
  attempts of the worst reading's tree; `movementText` reads `noiseOfSteps`, which is keyed by job **and** step.
  For a command that runs in five jobs -- `Install the shells` -- the two can be different readings of one tree,
  and one sentence prints both.
- **`R14` is retired and its volume is not annotated.** `volume-20` still carries the section that argued for it,
  in the present tense, and a reader who stops there has the old rule. The audit entry is the only pointer, and
  the log's convention is that a round is not rewritten.
- **The delta is measured by a script that is not committed.** "0 of 38 bounds move" came from a replay against a
  reconstruction of `R14`; the gate asserts the new rule and cannot assert the difference between the two.

### Not claimed

That the state is the **machine's**. The evidence is that the content is identical (146 sites) and that one tree
repeats itself to a second; nothing here reads the box, and the instrument that would -- a load average, a cgroup
throttling counter, the runner's own timestamps -- lives in the job log, which this sandbox cannot reach
(`O-141`).

Nor that the step has **two modes**. Seven readings on one afternoon are two clusters here because they are 40%
apart with nothing in between; a wide spread would look the same at this sample size, and the rule does not need
the shape -- only that a run can land in a state the bound must cover.

Nor that 900 s is the ceiling on that state: the fourth slow reading is 885 s, and nothing in the file says the
state cannot be slower.

### Readings

> Ledger for `v3.151`.

| item | value |
| --- | --- |
| CI | run `45626206585` on `90303700` -- the tree `v3.150` shipped: **8 of 8 jobs success**, 980 s, and the **forty-fifth reading** (885 s of second shard, 480 s of first); it is this round's recording, because the round before left the recording one run behind |
| `pnpm run docs:check` | **23 steps, exit 0** |
| `core` test suite | **260 files, 7052 tests passed** (at v3.151) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.151) |
| repo test suite | **264 files, 7239 tests passed** (at v3.151) |
| the history | **45** readings over **43** commits, after the forty-fifth was recorded and the reading before it left untouched |
| new tests | **7,050 -> 7,052, +2**: twelve on the rule in place of ten (the falsifier at 22 minutes, a recording that landed in the fast state, the worst day of a tree with its attempts, one attempt's two jobs, the worst state over every tree, the pair beside the multiple, the pair in the refusal, the lookup, the control, and the three states of the range's share) less eight that asserted `R14`'s arithmetic |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/` |
| mutation | **12 groups, 54 red cases, 0 survivors**, each measured on the green tree and restored byte for byte |
| the rule's own falsifier | the 22-minute case returns `[]` under a reconstructed `R14` and one refusal under `R16` |
| the delta | **0 of 38** bounded steps change verdict; the worst day and `R14`'s faster attempt are the same reading in every one of them |

### Left open

`O-126`, `O-133`, `O-136`, `O-137`, `O-108` and `O-134` are unchanged. `O-139` is closed by finding 654, `O-138`
and `O-126` with it -- the first two because the rule no longer divides a tree's best attempt, the third because
the multiple now takes the worst mode by construction rather than per mode by declaration. Two entries come out
of the round:

- `O-140` · **The margin clause reports the workflow's narrowest bound, not the bounds whose own movement is
  more than half their reading.** Two of the 38 rest on a step that moved by more than half its own reading --
  `sites`' second shard among them -- and a reader who wanted the list has to assemble it from 38 sentences that
  are not printed.
  `[open: whether `budgetSummary` should print the count of bounds whose movement exceeds half their denominator,
  with the widest one named -- a number that is a share of the bound rather than of the range -- or whether the
  share printed for the tightest step is the whole of what a reader needs]`
- `O-141` · **A reading records no evidence of the machine's state, so the state is inferred from the series.**
  The sites battery's 600 s and 900 s readings are 146 identical sites apart, and the only statement the file can
  make about them is that one tree repeated itself to a second. The instrument that would say what the box was
  doing -- `/proc/loadavg`, the cgroup's throttling counters, the runner's own timestamps -- is printed by the job
  and reachable only through the job log, which this sandbox cannot fetch: the logs endpoint redirects to a blob
  host that resolves to `198.18.0.16` here.
  `[open: whether a measured step should print a machine line beside its own output, so the recorder can attach
  the box's state to the reading -- a step that measures the runner rather than the program, and one whose
  absence has to read as *not measured* rather than as a quiet machine -- or whether the pair and the site count
  are the whole of what a reader can be given from a file this repository can read]`

## v3.152 — the mode that judges refuses the tree the mode that repairs refuses

`v3.151` shipped and CI came back **four jobs red out of eight** (run `45643248364`; the anchor round trip
beside it, `45643248351`, green). One line, printed by four different steps:

```
  - ## Repository says '680' for Tracked files; the tree says '681'
check-repository-table: FAILED
```

The local gate had exited 0 on the same file minutes earlier, on the same bytes. The difference is one
untracked path: `docs/progress/volume-21.md` was written and not yet staged, so `git ls-files` held 680
entries and the document's `680` was true of the index. `git add -A` moved the index to 681, the same
command refused the same table, and the push carried a tree where the guard is right -- because a checkout
has no untracked files at all.

### The defect, stated as two populations

`check-repository-table` derives eight rows from two different places:

| row | read from | sees an unstaged file? |
| --- | --- | --- |
| `Tracked files` | `git ls-files` -- the **index** | no |
| `Source files`, `Source lines` | `readdirSync` over `packages/*/src` -- the **worktree** | yes |
| `Test files`, `Test lines` | `readdirSync` over `packages/*/test` | yes |
| `Tests` | `golden-master/doc-counts.json`, measured by a run | yes, one step later |
| `Commits`, `Packages` | `git rev-list`, `git ls-files` | no |

With one untracked file present the table is not stale, it is **about two trees**: one row counts the index
and five count the filesystem, and the arithmetic has no reason to agree. The guard knew this -- it wrote the
refusal in `v3.83`, after a round published `Tracked files 638` before `git add` and the next check read
`639` -- and put the refusal **inside `if (writing)`**, the branch only the repairing mode takes. So the mode
that publishes refused, and the mode that judges could not see the state the publication had been made in.

### The falsifier

Executed, not argued. A fixture tree committed and otherwise green, then one untracked `notes.md`:

```js
const fixture = makeTree('check-untracked');
withTable(fixture, defaultTable(fixture.rev));
expect(run(fixture).status).toBe(0);          // the table is right about the index

writeFileSync(join(fixture.root, 'notes.md'), 'A file the round has not staged yet.\n');
const rejected = run(fixture);
expect(rejected.status).toBe(1);              // v3.151: 0, and that is the bug
```

Under `v3.151` that third line reads `0`: the guard compares `8` against `8` and reports eight rows derived
from "the tree". Under `v3.152` it refuses and names the file, the rows, and the way out:

```
  - 1 file(s) exist and are not tracked (first: notes.md), so `Tracked files` would count the index and
    `Source files` and `Test files` count the worktree, which is one table describing two trees; stage them
    first (`git add -A`) or remove them
check-repository-table: FAILED
```

The second half is the boundary from the other side, because a refusal that persisted after staging would be
a guard nobody can satisfy and a refusal that went quiet would be the original defect with an extra step:
`git add -A`, then the same command, and the message **changes kind** -- refusal, then drift --
`says '8' for Tracked files; the tree says '9'`. `--write` then publishes 9 and the table is green again.

### What the round did to the documents' claims

| claim | before | after | why |
| --- | --- | --- | --- |
| failure sites in the inventory | 146 | **146** | the refusal moved out of one branch into two modes; the site at line 466 is the site at 483 |
| claims covered by `verify-site-proofs` | 248 | **248** | unchanged: the file that drives this guard is the same file |
| `core` tests | 7,052 | **7,054** | two fixtures for the two sides of the boundary |
| `core` test lines | 120,747 | **120,796** | the two fixtures and their comments |
| `Tracked files` | 680 | **681** | `docs/progress/volume-21.md`, the file whose staging started this |
| `Packages`, `Source files`, `Source lines`, `Test files` | -- | unchanged | no source or test file was added |

`golden-master/gate-sites.json` was re-derived rather than hand-edited, and its only diff is that one line
number -- which is the useful reading: **moving a guard's refusal between modes does not create a site**. The
site existed and was proved; what changed is which state reaches it.

### The four red jobs, and what each was reading

The same sentence appears in four steps because four steps read the table:

| job | step | why the number reached it |
| --- | --- | --- |
| `golden master / official metric / examples / documents` | 11, documentation guards | the guard is a step of `docs:check` |
| `cold tree / no build / every precondition declared` | 7, documentation guards that read no build artefact | the same step, run in a job that proves it needs no build |
| `build / typecheck / lint / coverage / mutation` | 9, lint | `verify-site-proofs` runs the test file that drives this guard, and a proof whose baseline is red proves nothing |
| `every proved exit can disappear without a word (shard 2 of 2)` | 8, the battery | same reason, from the sensitivity side: the whole file is the claim's witness |

That table is an inference from the steps' names and from what each one spawns, because the job logs are not
reachable from here -- the logs endpoint redirects to a blob host that resolves to `198.18.0.16` (finding
655's limit, unchanged, `O-141`). The evidence that the inference is right is that all four commands exit 0
on this tree after the number was repaired, and the round's own CI run is the confirmation rather than the
argument.

### Four things this round did wrong, written down

- **The gate was run on a tree that was not the tree the commit carried.** This is the process defect the
  code defect is a symptom of: `docs:check` exited 0 on a worktree holding an unstaged file, and the round
  read that as "the tree is green". Running the gate after `git add -A` would have caught it before the push,
  and nothing in the corpus said so.
- **The guard's own prose claimed the refusal it did not have.** The docblock's "What is not checked" section
  did not mention the index/worktree split at all, and the fixture comment in the test file said "the guard
  now refuses to derive over an untracked file" -- true of `--write`, false of the mode the corpus runs. This
  is finding 654's shape exactly, one round later: a rule and the sentence describing it, drifting apart in
  the direction that flatters the rule.
- **The first repair was in the wrong place.** `v3.83`'s refusal was written where the failure had been seen
  -- inside the rewrite -- and the round that followed it tested the rewrite. A refusal is a property of the
  *measurement*, not of the mode that stores it.
- **The counts were repaired before they were understood.** The first attempt set `Tests` to 7,054 in
  `docs/progress.md` alone, which the guard refused in the other direction (`the tree says '7,052'`): the row
  is cut from the snapshot, and the snapshot is cut from a run. The order that works is snapshot, then
  document, then gate -- and it is written here because the next round will meet it again.

### Not claimed

That `docs:check` cannot go green on a dirty tree. It can, and should: uncommitted *edits* to tracked files
are measured by the rows and refuse themselves through the numbers, which is the behaviour the docblock
describes. The refusal here is narrower -- a path that is **not in the index** -- and it is a refusal rather
than a measurement because there is no number that would be right.

Nor that the four CI jobs failed *only* because of this line. The steps were asked, and the shard's own count
of red cases is the reading that would have said otherwise; the round re-ran the battery locally and it is
green at the same 146 sites, which is the strongest statement available from here.

Nor that two fixtures are enough. They exercise the refusal's exit and the sentence that names the rows; the
message's *wording* is asserted by `toContain` on three fragments, and a rewrite that said the same three
things in a misleading order would pass.

### Readings

> Ledger for `v3.152`.

| item | value |
| --- | --- |
| CI | **8 of 8 jobs success** -- run `45626206585` on `90303700`, the newest green run and the one the recording was taken from; this round adds no reading, because the tree it reports first ran red (below) and a red run's step seconds are the seconds of a step that stopped |
| the run this round reports | run `45643248364` on `d4ae8d6` -- the tree `v3.151` shipped -- **4 of 8 jobs success**, the four named in the table above; `45643248351` (anchor round trip) was green on the same tree, so the breakage is inside `CI` and not in the tree's own content |
| `pnpm run docs:check` | **23 steps, exit 0**, after the number and the snapshot were retaken |
| `core` test suite | **260 files, 7054 tests passed** (at v3.152) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.152) |
| repo test suite | **264 files, 7241 tests passed** (at v3.152) |
| the history | **45** readings over **43** commits -- unchanged: this round's CI run is the next reading, not this one |
| new tests | **7,052 -> 7,054, +2**: the refusal in the judging mode, and the same boundary from the other side after `git add` |
| `golden-master/gate-sites.json` | re-derived; **146 sites across 69 of 103 scripts**, one line number moved (466 -> 483), no site added or removed |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/` |
| mutation | **3 groups, 6 red cases, 0 survivors**, each measured on the green tree and restored to an identical `md5`: the hoisted refusal deleted (**3** red -- the rewrite refusal, the judging refusal, and the boundary after staging), the two modes made to share one sentence (**1** red, the judging refusal's assertion that the rows are named), and the refusal narrowed back to `--write` (**2** red, which is the v3.151 bug put back) |

### Left open

`O-133`, `O-136`, `O-137`, `O-140`, `O-141`, `O-108` and `O-134` are unchanged. One entry comes out of the
round:

- `O-142` · **A round can run the whole gate on a tree the commit will not contain, and nothing says
  otherwise.** The refusal now covers the one state that made the number wrong here -- a path outside the
  index -- but the general case is unchanged: tracked files with uncommitted edits are measured *and*
  committed from different states, and the reading a round reports is the reading of the worktree. The
  corpus's own practice is to run `docs:check` before `git add`, which is the order that hides this.
  `[open: whether the gate should refuse to report a verdict at all while any tracked file is modified, which
  would make every mid-round run red, or whether the round's ledger should carry the worktree's own digest
  beside the numbers so a reader can tell which tree was measured -- a refusal that costs a round its
  feedback loop, against a digest that costs a reader one more number to compare]`

## v3.153 — the battery charges each run to the claimant that paid, and stops at the first red

`v3.150` added six claims to one file and charged them **282 s**. That number was not a measurement of the six
runs: it was the difference between two afternoons. The battery printed one total, the recorder only ever saw
the step's wall clock, and a total cannot be divided after the fact -- so the round that adds a claim cannot
say what the claim cost. Two entries came out of that observation, and this round closes one and sharpens the
other.

### The instrument first: one row per claimant, with its own claims and runs

The battery now prints one row per claimant after the credit line:

```
verify-sites-are-sensitive: packages/core/test/ci-budget.test.ts -- 30 claim(s) in 30 run(s), 541.8 s (slowest 21.0 s)
verify-sites-are-sensitive: 129 mutant run(s) cost 587.1 s of child time inside 3.1 min of wall clock,
  3.2x the clock with 4 at a time; the dearest claimant is packages/core/test/ci-budget.test.ts at 48% of that
```

Two facts follow that no earlier line could carry: **which claimant** paid, and **how many runs** the total is
made of. The seconds come from `elapsedMs` measured around each child, so they are that claimant's own time
rather than a share of the shard's.

### The pair: one tree, one claim set, an hour apart

The comparison is paired, because the last two rounds established that two afternoons are not a control (finding
655). Same tree, same box, same shard, two runs an hour apart, the only difference being one line of the gate.
The 32 claimants both runs could measure, and their 125 claims:

| claimant | without `--bail` | with it |
| --- | --- | --- |
| `ci-budget.test.ts` | 541.8 s | **282.3 s** |
| `fetch-official.test.ts` | 294.0 s | **89.5 s** |
| `check-fault-cases.test.ts` | 250.7 s | **40.1 s** |
| `gates-are-testable-is-enumerated.test.ts` | 54.1 s | **25.9 s** |
| `check-official-roundtrip.test.ts` | 49.0 s | **17.1 s** |
| `gen-examples.test.ts` | 45.2 s | **28.1 s** |
| **the 32, added up** | **1382.7 s** | **577.1 s** — **-58.3%** |

And the shard as a whole: **6.4 min -> 3.1 min** of wall clock with four runs at a time.

The one asymmetry is worth writing down rather than smoothing: the control run measured **125** claims and the
flagged run **129**, because the four claims of the battery's own test file cannot be measured while the flag is
absent -- the file asserts it. The flag's own proof is the one claim the control cannot run.

### Why the flag is sound, and not merely faster

The claim a mutant run proves is **"some test goes red"**. Once one does, the rest of the file adds nothing to
that sentence and is charged to the claim anyway. The two ways the flag could weaken the battery are both
closed by construction:

| run | verdict | what `--bail` would do to it |
| --- | --- | --- |
| a mutant | some test goes red | stops at the first red; the verdict is unchanged, and the mutant's record is written when the site executes, which is before the failure |
| a survivor | no test goes red | nothing: a survivor's verdict **is** the whole file staying green, and a file that never went red never bails |
| a baseline | the longest single test of this file | **refused the flag**: a run that stopped at the first red would report the longest test of a file it had not finished -- a number about a subset printed as a number about the file |

The third row is the one that had to be written as a test rather than as a comment, and it is: the mutant's
argv carries `--bail`, the baseline's does not, and the baseline case is taken from a run that never reaches a
mutant (a claimant that is red on its own).

### What CI said, which is less than the local pair and more useful

Reading 47 -- this round's own run, `45673244483` -- records the two shard steps at **231 s** and **460 s**,
against **488 s** and **596 s** in reading 46: **-257 s** and **-136 s**. The workflow fell from **969 s to
771 s** (-20%).

The local pair's 52% did not survive the move to a four-vCPU runner intact: the shard that the 900 s reading
came from kept **77%** of its time, where the box these were measured on kept 48%. That difference is the
useful part, because it says what the remaining seconds are: a runner pays more of a run before the first red
than a 32-vCPU box does -- more startup, more contention, fewer cores for the file's own tests -- and `--bail`
cannot shorten what it reaches late.

And the critical path is no longer this battery. `batteries-heavy` took **761 s** of the 771 s run, so the
workflow now waits for the two probe-rewrite batteries, which this round did not touch. The next round that
wants the wall clock has to look there, and the instrument for it is the one this round built: a probe battery
that prints per-step seconds the way the sites battery prints per-claimant ones.

### Four things this round did wrong

- **The first control was run on a tree that was not consistent.** The control run removed `--bail` from a tree whose
  own test asserts it, and separately the tree's counts were mid-edit, so three claimants failed on their own
  and two more could not be measured. The pair above is the second attempt, run after the counts were retaken
  and after the inventory was re-derived -- and the first attempt is written here because it is the third time
  in three rounds that a measurement was taken on a tree that was not ready to be measured.
- **The inventory was not re-derived after the script was edited.** `gate-sites.json` records line numbers; inserting fifty lines moved
  one of them and the battery then armed a mutant at the wrong statement, which surfaced as "passed with the
  exit hollowed but never recorded the mutant". The deriver is not part of the battery and nothing reminded me.
- **The flag's gain was measured twice in one day before the numbers matched.** The first flagged run reported 583.9 s against a control's
  1415.3 s, on different claim sets: a ratio of two shards, which is the arithmetic this whole campaign has
  been removing. The paired table is the repair.
- **`prometheus` was not in this sandbox.** `reader-against-backend` refused to run until it was installed, so the first
  green-looking shard was green over 33 of 34 claimants. The CI job installs it (step 6); this box did not, and
  the round had to install it to measure the shard it was changing.

### Mutations

| mutation | red |
| --- | --- |
| the flag removed from the mutant run | 1 |
| the flag given to the baseline as well | 1 |
| the per-claimant rows deleted | 1 |
| every row charged the whole inventory's claim count | 1 |

**4 groups, 4 red cases, 0 survivors**, each measured on the green tree and restored to an identical `md5`.

### Left open

`O-133`, `O-140`, `O-141`, `O-108`, `O-134` and `O-129` are unchanged, and `O-137` is closed by this round's
rows: the battery says what each claimant's runs cost, so a claim added to a file can be charged to it. One
entry moves, and it is sharpened rather than closed, because the measurement says its premise was half wrong:

- `O-136` · **A claim's run still pays the fixed cost of a run and every test before its first red, and the
  inventory names no test.** The price was never "claims times file": it was "claims times the file up to the
  first red", which is why one flag took **58.3%** of it. What is left is the run itself -- `ci-budget.test.ts`'s
  30 claims cost **282 s**, against the **0.6--0.8 s** a single-claim claimant pays -- and naming the test in the
  inventory would remove the second half at the price of an inventory every claim has to survive.
  `[open: whether `provedBy` should carry the test, which `derive-gate-sites` cannot derive statically because
  which test goes red is a fact about a mutation and has to be measured first, or whether nine seconds a run is
  a price worth paying for an inventory that is derived rather than recorded]`

### Readings

> Ledger for `v3.153`.

| item | value |
| --- | --- |
| CI | **8 of 8 jobs success** -- run `45673244483` on `e2bf2db`, **771 s**, and the **forty-seventh reading**: the two shard steps read **231 s** and **460 s**, against **488 s** and **596 s** in the reading before it |
| the run before it | run `45652928012` on `9269682` -- **8 of 8 jobs success**, 969 s, the **forty-sixth reading**, taken at the start of this round because the previous one shipped that tree and could not record it |
| `core` test suite | **260 files, 7057 tests passed** (at v3.153) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.153) |
| repo test suite | **264 files, 7244 tests passed** (at v3.153) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/` |
| new tests | **7,054 -> 7,057, +3**: the per-claimant rows, the flag on the mutant's argv, and the baseline's refusal of it |
| the pair | **1382.7 s -> 577.1 s** over 32 claimants, 125 claims and 125 runs either side, an hour apart on one box; the shard **6.4 -> 3.1 min** |
| the battery, both shards | **129 claims in 3.1 min** and **119 claims in 2.0 min**, 0 survivors, 0 unrecorded, 0 truncated |
| mutation | **4 groups, 4 red cases, 0 survivors**, each measured on the green tree and restored to an identical `md5` |
| the inventory | **146** sites, one coordinate moved by the round's own insertions (768 -> 829), and the file re-derived rather than edited |

## v3.154 — a run pays for the claim it makes, and the compile nobody read

`v3.153`'s ledger ended with a sentence that named the next round's subject: the critical path was no
longer the sites battery, `batteries-heavy` had taken **761 s** of a 771 s run, and "the instrument for it
is the one this round built". This round pointed that instrument at both batteries, and both were buying
work nobody had asked for.

### The instrument, applied

`type-miss-probe` prints one row per **claimant** -- the file an injection edits -- with the injections it
holds, the compiles it paid for, and the seconds split between compiling and probing. `backend-support`
prints one row per **test file**, with its runs, its seconds and its slowest single run. Both end with a
total that names its own run count. The instrument had to come first: the two steps reported `360 s` and
`379 s`, and a total is not a measurement (finding 657), so neither could say which injection or which
file the time belonged to.

The first reading of the type-miss battery, on the box this round measured everything on:

| claimant | injections | builds | seconds | of which compiling |
| --- | --- | --- | --- | --- |
| `derivation` | 17 | 17 | 41.4 | 38.6 |
| `scorer` | 6 | 6 | 14.8 | 13.8 |
| `rca100` | 6 | 6 | 14.4 | 13.4 |
| `collector` | 4 | 4 | 9.6 | 9.0 |
| the other twelve | 41 | 27 | 67.4 | 53.4 |
| **74 injections** | | **60** | **147.7** | **130.1** |

Two numbers in that table are the round. Compiling is **88%** of the child time, and there are **60**
compiles for 57 in-package injections -- where there had been 114.

### Finding 658: a whole-file run is a superset of the claim it is run for

The 83 rows of `backend-support` are each a claim of the form *this mutation makes this named test fail*,
and each was measured by running the file the test lives in and looking for the name in the output. That
is **347 s** of child time to measure 83 claims about one test each.

`--testNamePattern` is the same claim asked directly, and it is not the weaker instrument: the verdict
still requires a non-zero exit **and** the name in the output, so a run that collected nothing and a run
whose named test passed stay distinguishable. What is no longer observed is the case "a different test
went red", which used to read MISATTRIBUTED and now reads SURVIVED -- the named test did not catch the
mutation, which is exactly what the row claims.

The change was measured before it was taken, on one tree, alternating the two forms row by row:

| | whole file | named test | |
| --- | --- | --- | --- |
| 83 runs, child time | 347.0 s | **53.2 s** | **-84.7%** |
| verdicts that agreed | 83 | 83 | **0** disagreements |

and the battery run alone, on its own: **83 caught, 0 survived, 0 inert, 0 misattributed, 54 s**.

The name is passed through `re.escape`, and that is the one place the care looks excessive.
`--testNamePattern` compiles its argument as a regular expression, and one of the 83 names contains
`[timestamp, line]`: unescaped, the class matches a single character and the pattern matches no test at
all, so a mutation that was caught perfectly well would be reported MISATTRIBUTED -- a battery blaming
its own suite for an escaping defect. The new test measures both directions on the real name rather than
on a name invented for it.

### Finding 659: the restore compiled the package back, and the next injection overwrote it

An in-package injection must compile; that compile **is** the measurement, and a mutation that does not
compile would otherwise run the previous build and report against a rule it did not install. What was
not a measurement was the second compile: the `finally` put the committed source back and compiled it,
and the next injection's build then wrote its own output over the same `dist`. 57 measurements, 114
compiles of a 260-file package, and half of them read by nothing.

The source is still restored immediately -- that is what the byte-for-byte check at the bottom of
`run_probe` reads -- and the **compile** is deferred to the first reader that needs the committed rule:
the next injection that edits only the probe or the fixture, or the end of the battery. `_STALE_DIST`
records which state `dist` is in, `flush_dist` is the one thing that compiles it back, and the same
function is registered with `atexit`, so a run that never reaches the end -- an injection raising, a
guard calling `sys.exit` -- still leaves a package that reflects the tree. That last path is a test, not
a promise: a child imports the battery, marks the package stale, and exits without calling `flush_dist`,
and the marker its patched compiler writes is the measurement.

| | before | after |
| --- | --- | --- |
| compiles of `packages/core` | 114 | **60** |
| wall clock, one tree, back to back | 269.1 s | **150.8 s** |
| battery verdict | 74 caught, 0 survived, 0 inert, 0 blind | the same |

Three alternatives were measured or reasoned and refused:

- **`--incremental`**: 2.27 s -> 0.77 s per compile, three times the saving this round took. Refused
  because tsc keys a file by modification time and size, and the whole job here is to compile a file that
  was just written twice. A size-preserving mutation, restored inside one tick, would be read as
  unchanged -- and a `dist` that keeps a mutation is the worst state this battery can leave, because
  `_witnesses` journals the source and not the build output.
- **mutating `dist` directly**: no compile at all, and 57 anchors restated against emitted JavaScript --
  a second table to maintain, coupled to what `tsc` emits, and it would lose the compile check.
- **reordering the injections** so the in-package ones are contiguous: 60 builds -> 58, at the price of a
  report whose order is chosen by cost. Two compiles are not worth that.

### What CI said

(the round's own run, filled below in `Readings`)

### Six things this round did wrong

- **The first version of the new test wrote the probe back over itself.** `run_probe` restores
  `scripts/probe-type-misses.mjs` on every path, including the ones with nothing to restore, so a test
  that drove it was a test writing inside the package it tests -- which
  `tests-do-not-write-inside-the-package.test.ts` refused. The fix is to point the battery's own two
  inputs at the temporary directory as well, and it is the right fix rather than an exemption: the case
  is about the *schedule* of compiles, and it has no business touching the shipped probe.
- **Backticks inside a `python3 -c` heredoc inside a template literal.** esbuild ended the template at the
  first backtick and reported `Expected ")" but found "scripts"`, which names the transformer and not the
  mistake. Third time in this campaign that a JavaScript diagnostic has cost a read.
- **The counts could not be measured before they were published.** `measure-doc-counts` runs the suite,
  and the suite holds the document to the counts it publishes, so the first move had to be arithmetic
  (`7,057 + 3` tests, `260 + 1` files) with the measurement confirming it afterwards. It confirmed first
  time, which is the fixed point being reached by luck rather than by method: the round wrote down what
  it expected and the run agreed, and a run that disagreed would have been the only evidence.
- **Dating v3.153's three `as of this commit` rows emptied the corpus's only current-state rows.**
  `check-doc-counts.test.ts`'s non-vacuity assertion caught it, and its message -- `no current-state rows
  found` -- is the one sentence in this campaign that says what the convention is: exactly one ledger,
  the newest, carries them. The volumes do not say it anywhere.
- **`golden-master/unit-nouns.json`'s `file(s)` relation still said 479**, which had been true since
  v3.136 because no round between had added a file. This one added one, and the gate refused a sentence
  quoting a corpus that had grown -- the first reading of a figure that had been right by not moving.
- **The paired run's output was buffered through `tail`**, so a 6 m 40 s measurement was unreadable until
  it ended. The numbers arrived; the round could not have noticed a hang.

### Mutations

| mutation | red |
| --- | --- |
| `backend-support` asks for the whole file again | 1 |
| `backend-support` passes the name unescaped | 1 |
| `type-miss` compiles the restore again | 1 |
| `type-miss` leaves a reader without the committed rule | 1 |
| `type-miss` drops the `atexit` backstop | 1 |

**5 groups, 5 red cases, 0 survivors**, each measured on the green tree and restored to an identical
`md5`.

### Left open

Nothing closes this round. The eight entries that were open are open, and the round's other result is that
the list's prices have moved:

- `O-136` · **A claim's run still pays the fixed cost of a run and every test before its first red, and the
  inventory names no test.** This round took the fixed cost out of a *battery's* arithmetic -- 83 runs of one
  test instead of 83 whole files -- and left this one's subject alone: a single claim still pays vitest's
  startup and the file's work up to its first red, and `golden-master/gate-sites.json` still names a file
  rather than a test.
  `[open: this round removed a battery's fixed cost and not a claim's -- one claim still pays vitest's startup
  plus its file up to the first red, and `provedBy` still names a file, so the decision the live entry holds is
  the same one it held before the round]`

`O-133`, `O-140`, `O-141`, `O-108`, `O-134`, `O-129` and `O-142` are unchanged. What moved is the critical
path, and the movement is the other half of this round's result: with both probe batteries at roughly a third
of what they were, `batteries-heavy` stops holding the workflow and the wall clock moves to `verify`
(**732 s**, of which `Lint` is **509 s**) and to `batteries` (**659 s**, of which `Every gate can be shown to
fail` is **242 s**). The next round that wants the wall clock starts with `verify-site-proofs.mjs`, which this
round timed at **273 s** on this box and which spawns one child per file, serially, over 69 files.

### Readings

> Ledger for `v3.154`.

| item | value |
| --- | --- |
| CI | **8 of 8 jobs success** -- run `45673244483` on `e2bf2db`, which is the run of the round *before* this one: a round cannot cite the run its own commit causes, and a row that guessed one would be a promise. It is replaced by this round's run in the commit that follows this one, which is the same two-step every round in this log has taken |
| `core` test suite | **261 files, 7060 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **265 files, 7247 tests passed** (as of this commit) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/` |
| new tests | **7,057 -> 7,060, +3**: the named-test argv and its escaping, the compile schedule, and the `atexit` backstop |
| the pair, `backend-support` | **347.0 s -> 53.2 s** over 83 runs measured both ways on one tree, **83 of 83** verdicts identical |
| the pair, `type-miss` | **269.1 s -> 150.8 s** on one tree, back to back; **114 -> 60** compiles |
| the batteries, as run | `type-miss` **74 caught, 0 survived, 0 inert, 0 blind**, 147.7 s of child time in 151 s; `backend-support` **83 caught, 0 survived, 0 inert, 0 misattributed**, 53.0 s in 54 s |
| mutation | **5 groups, 5 red cases, 0 survivors**, each measured on the green tree and restored to an identical `md5` |
| the inventory | **146** sites, unmoved: both repairs are in `scripts/injection/`, which `derive-gate-sites` does not scan |
