# Iteration #146 candidate — benchmark runs die on a reset connection

## What happened

During the #145 same-instant 4+4 A/B, one of the eight benchmark runs
(`33897750172`, control arm) failed:

```
2026-09-04T17:09:38Z ##[error]terminated
TypeError: terminated
    at Fetch.onAborted (node:internal/deps/undici/undici:11473:53)
    at Fetch.terminate (node:internal/deps/undici/undici:10631:14)
    at TLSSocket.<anonymous> (node:internal/deps/undici/undici:6531:16)
```

It died ~14 min into a 500-question run, right after the diagnostics step
finished. The upload step still ran, so the run produced a **2 KB stub
artifact** rather than failing cleanly — a real hazard, because a naive
downloader would accept that stub as a completed run.

## Root cause

Not a product bug. Two separate things:

1. **Peak concurrency.** The A/B dispatched all 8 runs within 18 seconds, so
   eight 500-question benchmarks hit the LLM provider simultaneously. The
   existing retry layer (`packages/cortex-llm/src/retry.ts`, 5 retries with
   exponential backoff totalling ~31 s, and it *does* retry network errors)
   was not enough: the throttling outlasted the entire retry window.

2. **No per-request timeout.** `retryableFetch` passes no `AbortSignal`, so a
   connection that hangs instead of resetting hangs indefinitely. The only
   backstop is the workflow's 240-minute timeout. A hang is therefore not
   converted into a retryable error.

## Why it was not caught earlier

Previous A/Bs used the same 8-at-once dispatch and got lucky. The failure rate
only became visible now, and nothing in the pipeline validated the artifact, so
a stub would have been indistinguishable from a real run.

## Fixes, in priority order

- **P0 (harness, done in #145):** `download_ab_tr_two_event.sh` now validates
  every artifact — it must contain both per-question diagnostics files *and* a
  report whose `questionCount` is 500 — and rejects anything else.
- **P1 (harness):** dispatch the 8 runs as four same-instant **pairs** spaced a
  few minutes apart instead of all at once. Drift in abstention operates over
  hours, so a ~20 min spread is negligible, while peak concurrency drops from 8
  to 2.
- **P2 (product):** give `retryableFetch` an `AbortSignal.timeout()` so a hung
  request becomes a retryable error instead of an unbounded wait. Needs its own
  TDD iteration with tests covering timeout → retry → success, and must not be
  mixed into an A/B whose attribution depends on the LLM call pattern staying
  fixed.

## Deliberately not done now

P2 changes the network behaviour of every LLM call, which would contaminate the
#145 attribution. It waits for its own iteration.

---

# 2026-09-11 — `github.com` TLS outage during a push

## What happened

Pushing `624e241` failed repeatedly with two alternating errors:

```
fatal: unable to access 'https://github.com/AgentiX-E/cortex.git/':
  gnutls_handshake() failed: The TLS connection was non-properly terminated.
fatal: unable to access 'https://github.com/AgentiX-E/cortex.git/':
  GnuTLS recv error (-110): The TLS connection was non-properly terminated.
```

This is the recurring github TLS flakiness, and the usual remedy — re-pin
`/etc/hosts` from `~/.user_hosts` and retry — **did not work** this time. Three
retries, plus `http.version=HTTP/1.1`, all failed.

## Diagnosis

The failure was narrowed by probing endpoints and IPs separately:

| probe | result |
|---|---|
| `curl https://github.com` | `SSL_ERROR_SYSCALL`, code 000 |
| `curl https://api.github.com` | **200** |
| `curl https://codeload.github.com` | **301** |
| `curl https://objects.githubusercontent.com` | **404** |
| TCP connect to 140.82.121.4 / .113.4 / .112.4 / .114.4 / 20.205.243.166 : 443 | all **OK** |

So: TCP was fine to every endpoint, `api.github.com` served TLS normally, and
only the **`github.com` git host** refused to complete a handshake. That
distinguishes a host-specific TLS outage from a local routing or certificate
problem, and it means the `/etc/hosts` pinning workaround cannot help — the pin
was already correct.

## Resolution

Self-cleared. Re-probing the three candidate IPs ~10 minutes later returned
**200 on all three**, and the push then succeeded on the first attempt.

## Lesson

When a push fails with GnuTLS errors, do not assume another hosts re-pin will
fix it. Probe `api.github.com` alongside `github.com` and a raw TCP connect: if
TCP is up and `api.` is serving while `github.com` is not, it is a host-side
outage and the only correct action is to wait and retry, not to change config.
Churning `/etc/hosts` in that state risks leaving a wrong pin behind for the
next push.
