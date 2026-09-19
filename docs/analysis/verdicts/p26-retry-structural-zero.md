# P26 — the abstention retry has a structurally zero yield

Data: runs `35004814319` (`4955d8e`) and `35019792901` (`0b0069a`), full
500-question LongMemEval-S, `temperature = 0`.

## 1. The measurement, twice

| run | path | armed | fired | recovered |
|---|---|---|---|---|
| `35004814319` | MR | 121 | 0 | — |
| `35004814319` | single-session | 276 | **11** | **0** |
| `35019792901` | MR | 121 | 0 | — |
| `35019792901` | single-session | 379 | **12** | **0** |

**23 live fires across two full runs, 0 recoveries.** The P21/P23 claim that the
retry "is inert" was reached on the MR subset, where it never fires; the correct
statement is that it **fires on the single-session path and converts nothing**.

Capability split of the 12 in the newer run: TR 7, IE 4, KU 1. All 12 are
answerable questions whose ground truth the prompt did not contain, and all 12
returned a bare `UNANSWERABLE` twice.

## 2. Why the yield is exactly zero, not merely small

Reading `respondWith` (`natural-language-memory.ts`, the retry block):

```ts
if (retryEnabled && detectBareAbstention(raw, abstainToken)) {
  const retried = await completeFresh(prompt);   // <-- the SAME `prompt`
  retryFired = true;
  if (!isAbstentionValue(retried, abstainToken) && parser(retried, abstainToken) !== null) {
    raw = retried;
  }
}
```

The re-ask passes `prompt`, unchanged. At `temperature = 0` the provider is
deterministic — the codebase relies on exactly that elsewhere, and
`p23_significance.mjs` documents the systems as deterministic at this setting — so
the second call returns the same text as the first. A bare abstention therefore
recurs with probability 1.

**P(recovered) = 0**, which is why 23 fires produced 23 non-recoveries. The retry
is not under-performing; it cannot succeed, and it costs one model call per fire to
establish that.

This is also why `enableAbstentionRetry`'s ablation reports `+0.00%` with
`0 control / 0 treatment` fires on MR: the ablation's scope (121 MR questions)
is disjoint from the population where the retry actually fires (single-session).

## 3. What the retry needs to become, if it is kept

Three options, ordered by how much they change:

| option | mechanism | risk |
|---|---|---|
| **A. delete it** | remove the flag, the branch, `completeFresh`, and the ablation | loses a real defect signal: 12 answerable questions where the model refuses twice |
| **B. re-ask something different** | on a bare abstention, re-ask a *context-only* prompt ("what does the context say about X?") and parse that | it is a different mechanism, needs its own contract and its own tests |
| **C. relax caching only** | keep the identical re-ask but at `temperature > 0` | rejected — it buys noise, and it would make the benchmark non-deterministic, which breaks every paired statistic in the harness |

**A is the honest default** if no run can show the retry recovering a question, since
the current version is a guaranteed no-op that spends budget. **B is the version
worth building** if the 12-question population is worth targeting, and it is: they
are answerable, the retrieval did return something, and the failure is the model
declining rather than the evidence being absent.

I am not choosing between A and B here. What is settled is that the shipped retry
cannot work, and that shipping it while its ablation reports `+0.00%` is worse than
not having it, because the ablation's scope makes a structural zero look like a
measured null.

## 4. Test that must exist

The structural claim should be pinned, not just argued:

> with a stub LLM that returns a bare abstention every time, `retryFired` is true
> and the answer is still the abstention — i.e. the retry is *observed* to run and
> *observed* not to recover, so a future change that makes the second call different
> has to update this test deliberately.

A second test should assert the fire count on a real run is reported by the ablation
rather than the MR-only figure, so the scope limit that hid this for two
investigations cannot recur.

## Status

Root cause established with 23 observations and the code path. Fix not chosen;
options A and B above with the trade-off stated.

---

> **SUPERSEDED by `p28-retry-redesign-verdict.md`.**
>
> Option B was built (`f39e7f9`) and run (`35162802298`). The structural zero
> proved in §2 is **gone** — the second attempt now asks a different prompt, so
> the recurrence of the abstention is no longer guaranteed. The measurement
> still read **0 recoveries**, on 14 fires instead of 12, with every historical
> fire unchanged.
>
> So §2's *proof* was correct and is now obsolete, while §1's *observation* was
> correct and has been reproduced under a mechanism that is no longer incapable.
> The distinction the verdict rests on: the retry is no longer inert **by
> construction**; it is inert **in effect**. Two different claims, and only the
> second one survives.
>
> §4's second test requirement — that the ablation report the real fire count
> rather than the MR-only figure — was met by `cadedcb`; the report now reads
> `longmemeval-retry` at 500 questions and 14 fires. §4's first test was
> rewritten as part of the redesign: it now asserts the two attempts **differ**,
> which is the property that had to be pinned.
>
> §3's "A is the honest default" recommendation is restored but on stronger
> grounds: A is now backed by a *measured* null on a capable mechanism, not by a
> structural argument. See `p28-retry-redesign-verdict.md` §8.
