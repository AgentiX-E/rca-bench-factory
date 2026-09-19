# Between-run variance over 4 config-identical runs

| # | run id | IE | MR | KU | TR | ABS | overall |
|---|---|---|---|---|---|---|---|
| 1 | `1-34492139716` | 133/150 | 103/121 | 57/72 | 86/127 | 26/30 | 405/500 |
| 2 | `2-34558715449` | 134/150 | 102/121 | 57/72 | 82/127 | 27/30 | 402/500 |
| 3 | `3-34558717704` | 134/150 | 101/121 | 56/72 | 85/127 | 27/30 | 403/500 |
| 4 | `4-34558719936` | 133/150 | 97/121 | 54/72 | 83/127 | 27/30 | 394/500 |

## Spread per capability (questions first)

| capability | series (correct) | range (q) | sd (q) | spread (pp) | mean acc |
|---|---|---|---|---|---|
| IE | [133, 134, 134, 133] | **1** | 0.50 | 0.67 | 89.00% |
| MR | [103, 102, 101, 97] | **6** | 2.28 | 4.96 | 83.26% |
| KU | [57, 57, 56, 54] | **3** | 1.22 | 4.17 | 77.78% |
| TR | [86, 82, 85, 83] | **4** | 1.58 | 3.15 | 66.14% |
| ABS | [26, 27, 27, 27] | **1** | 0.43 | 3.33 | 89.17% |
| **overall** | [405, 402, 403, 394] | **11** | 4.18 | 2.20 | 80.20% |

## Coverage of the per-question analysis

- graded questions per run: **500**
- questions with a per-question record: **470** (94.0%)
- not covered by the flip analysis: **30** (the ABS block, which has no per-question diagnostics)

## Per-question flips between run pairs (joined on `question_id`)

| pair | compared | stable | flipped in | flipped out | changed | changed % |
|---|---|---|---|---|---|---|
| 1→2 | 470 | 448 | 9 | 13 | **22** | 4.68% |
| 1→3 | 470 | 445 | 11 | 14 | **25** | 5.32% |
| 1→4 | 470 | 446 | 6 | 18 | **24** | 5.11% |
| 2→3 | 470 | 447 | 12 | 11 | **23** | 4.89% |
| 2→4 | 470 | 446 | 8 | 16 | **24** | 5.11% |
| 3→4 | 470 | 449 | 6 | 15 | **21** | 4.47% |

## Flips per capability, per pair

| pair | IE in/out | MR in/out | KU in/out | TR in/out | ABS in/out |
|---|---|---|---|---|---|
| 1→2 | 1/0 | 5/6 | 2/2 | 1/5 | 0/0 |
| 1→3 | 2/1 | 4/6 | 2/3 | 3/4 | 0/0 |
| 1→4 | 2/2 | 2/8 | 1/4 | 1/4 | 0/0 |
| 2→3 | 2/2 | 3/4 | 2/3 | 5/2 | 0/0 |
| 2→4 | 1/2 | 1/6 | 3/6 | 3/2 | 0/0 |
| 3→4 | 1/2 | 3/7 | 2/4 | 0/2 | 0/0 |
