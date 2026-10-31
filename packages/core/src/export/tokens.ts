/**
 * The two name shapes the RCAEval layout is built from, declared once.
 *
 * ## Why this is a module rather than two private functions
 *
 * Both of these lived at the bottom of `export/rcaeval.ts` until the SLI column arrived, and the
 * column is why they had to move: `main.py` recovers the service from the **path**
 *
 *     service, metric = basename(dirname(dirname(data_path))).split("_")
 *
 * and then looks for a column named `f"{service}_latency"`. So the alias the exporter publishes and
 * the directory segment upstream reads are two spellings of one token, and a second copy of the
 * sanitiser would be two chances for them to disagree -- the column would be named
 * `checkout_api_latency` while upstream computed `checkoutapi` from the path, and the lookup would
 * miss for a reason no test of either half could see.
 *
 * `export/sli.ts` imports `caseToken` from here for that reason, and the test that proves it derives
 * the name from `casePath`'s own output rather than from this file.
 */

/**
 * Drop the characters a flat `-`-separated directory name cannot carry, and
 * keep the ones it can.
 *
 * A name that sanitises to nothing would collapse the layout — `RE2--cpu_1`
 * has an empty service field that no reader can distinguish from a missing
 * one — so a fully-consumed token falls back to a fixed placeholder rather
 * than emitting a nameless segment.
 */
export function caseToken(raw: string): string {
  const kept = raw.replace(/[^A-Za-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  return kept === '' ? 'unnamed' : kept;
}

/**
 * The fault half of `{service}_{fault}`, which may carry underscores of its own.
 *
 * `parseRcaEvalPath` splits at the **first** underscore, so everything after it is
 * the fault and any underscore in it is part of the label. Keeping the character
 * here is what makes that reading round-trip: `ts-route-service_f3_1` goes out and
 * comes back as the service `ts-route-service` and the fault `f3_1`, where stripping
 * would have written `f31` and lost the distinction the corpus draws between `f3`
 * and `f3_1`.
 */
export function faultToken(raw: string): string {
  const kept = raw.replace(/[^A-Za-z0-9_-]/g, '').replace(/^[-_]+|[-_]+$/g, '');
  return kept === '' ? 'unnamed' : kept;
}
