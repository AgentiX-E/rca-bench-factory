#!/usr/bin/env node
/**
 * Does the corpus's ranking depend on the z-score's epsilon floor?
 *
 * `zScore` divides by `max(sigma, 1e-6)`, and the median-shift baseline uses the same constant for the
 * same reason. For a series that is flat before the onset and moves after it, `sigma` is zero and the
 * statistic becomes the excursion divided by an *implementation constant*: a counter that steps from
 * zero ranks above everything else by five orders of magnitude, not because it moved more but because
 * its baseline had no variance to normalise by. That is fine as a ranking heuristic and not fine as
 * evidence. `checkDiscrimination` accepts a case only when a separate component is **strictly louder**
 * than the answer, and if "louder" were a function of the floor rather than of the data, the corpus's
 * headline reading would be measuring its own constant.
 *
 * So the question is decidable and this answers it: rank every case twice, once with the shipped
 * floor -- one resolution of the declaration's own unit (finding 288) -- and once with a *relative*
 * floor of one percent of the baseline's own magnitude, and report the cases whose order changed,
 * separating a change of the answer's rank from a change of its displacement *kind*, because only
 * the second is what the corpus's claim rests on.
 *
 * The shipped arm used to be the `1e-6` constant restated, and comparing a constant against a share
 * of the baseline was the only comparison available while the constant *was* the shipped rule. Now
 * that the floor is a property of the unit, the second arm is the old behaviour, which makes this
 * probe a regression detector for the change itself: the cases whose description moves between the
 * arms are the cases the epsilon was deciding.
 *
 * ## What this is not
 *
 * It is not a gate. A case that ranks differently under the two floors is not a defect: the two floors
 * answer different questions (an absolute one about noise and a scale-free one about relative change),
 * and a corpus is allowed to contain both shapes. What would be a defect is the corpus's `strict`
 * classification turning on the constant, which is what the summary counts and what a reader is asked
 * to look at. A check that failed on the first number would be a check nobody could repair.
 *
 * ## The probe's own failure mode, which happened
 *
 * A `*.signals.json` file may state either of its two readings as `{ "parameter": "<name>" }` instead
 * of a number, and the expansion only understands numbers. The first version of this probe skipped
 * that resolution, so two cases produced `NaN` statistics, sorted into an arbitrary order, and were
 * reported as measurements. The count of unresolved readings is therefore printed rather than
 * assumed: a second reader that skips a step measures its own bug with the same confidence it measures
 * the corpus.
 *
 * Usage:
 *   node scripts/probe-z-floor.mjs [--cases <dir>] [--quiet]
 *
 * Exit codes:
 *   0  the reading was taken, whatever it says -- a case whose rank moves between the two floors is
 *      not a defect, and a probe that failed on the number it exists to report would be a gate
 *      wearing a probe's name
 *   1  an input could not be read: a missing index, a background that does not parse, a signals file
 *      whose declared reading resolves to nothing
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DEFAULT_CASES = resolve(REPO, 'golden-master', 'fault-cases');

const args = process.argv.slice(2);
let casesDir = DEFAULT_CASES;
let quiet = false;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--cases') casesDir = resolve(args[(index += 1)] ?? '');
  else if (arg === '--quiet') quiet = true;
  else if (arg === '--help' || arg === '-h') {
    console.log('usage: node scripts/probe-z-floor.mjs [--cases <dir>] [--quiet]');
    process.exit(0);
  } else fail(`unknown argument '${arg}'`);
}

const core = await import(resolve(REPO, 'packages/core/dist/index.js'));

/**
 * The one way out that is not success.
 *
 * A reading it could not take is not a reading of zero, so the probe refuses rather than printing a
 * smaller number -- and the refusal is stated once, so the inventory has one site to prove instead of
 * one per input.
 */
function fail(message) {
  console.error(`probe-z-floor: ${message}`);
  process.exit(1);
}

/**
 * The alternative arm's absolute fallback.
 *
 * The shipped arm no longer needs a constant: it asks `resolutionOf` what one step of the declaration's
 * own unit is. This number is what the *alternative* arm falls back to when its own scale is zero --
 * one percent of a baseline of zero is zero, and dividing by it is not a ranking -- so it is the
 * behaviour the corpus had before finding 288, kept here on purpose as the thing to compare against.
 */
const EPSILON_FLOOR = 1e-6;

/** The alternative: one percent of the baseline's own magnitude, or the absolute floor if that is larger. */
const RELATIVE_FLOOR = 0.01;

/** A file this probe needs, with its absence reported as a refusal rather than a stack trace. */
function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`could not read the ${what} at '${path}': ${String(error instanceof Error ? error.message : error)}`);
    return undefined;
  }
}

const index = readJson(join(casesDir, 'index.json'), 'case index');
const backgroundRaw = readJson(join(casesDir, 'background-telemetry.json'), 'background');
const background = core.parseBackground(backgroundRaw);
if ('problems' in background) fail(`the background does not parse: ${background.problems.join('; ')}`);

/** A reading a signals file may state as a number or as a reference into `fault.parameters`. */
function readings(declaration, parameters, where) {
  const out = { baseline: declaration.baseline, post: declaration.post, unresolved: 0 };
  for (const point of ['baseline', 'post']) {
    const stated = declaration[point];
    if (typeof stated === 'number') continue;
    const name = stated !== null && typeof stated === 'object' ? stated.parameter : undefined;
    if (typeof name !== 'string' || !Object.hasOwn(parameters, name)) {
      out.unresolved += 1;
      continue;
    }
    const quantity = core.readDeclaredQuantity(parameters[name]);
    if (quantity === undefined) {
      out.unresolved += 1;
      continue;
    }
    out[point] = quantity.value;
    if (quantity.unit !== undefined && declaration.unit === undefined) declaration.unit = quantity.unit;
    else if (quantity.unit !== undefined && declaration.unit !== undefined && quantity.unit !== declaration.unit) {
      out[point] = core.convertUnit(quantity.value, quantity.unit, declaration.unit);
    }
  }
  if (out.unresolved > 0) fail(`'${where}' states a reading the case's parameters cannot resolve`);
  return out;
}

function mean(xs) {
  return xs.length === 0 ? 0 : xs.reduce((total, one) => total + one, 0) / xs.length;
}

function stddev(xs) {
  if (xs.length < 2) return 0;
  const centre = mean(xs);
  return Math.sqrt(mean(xs.map((one) => (one - centre) ** 2)));
}

/**
 * Peak |z| per service, under one floor.
 *
 * The arithmetic is `baseline-localiser.ts`'s, restated here rather than imported because the shipped
 * function hard-codes its floor: the point of the probe is to vary the one thing that function does
 * not expose, and a parameter added to it for this purpose would be a parameter the corpus's own gate
 * never passes.
 */
function rankByPeakZ(signals, onsetMs, floor) {
  const before = new Map();
  const after = new Map();
  /** The unit of each key, which is what the shipped floor is a property of. */
  const unitByKey = new Map();
  for (const one of signals) {
    const at = Date.parse(one.timestamp);
    const key = `${one.resource['service.name']}|${one.payload.name}`;
    if (!unitByKey.has(key)) unitByKey.set(key, one.payload.unit);
    const target = at < onsetMs ? before : after;
    const bucket = target.get(key) ?? [];
    bucket.push(one.payload.value);
    target.set(key, bucket);
  }
  const peakByService = new Map();
  let nonFinite = 0;
  for (const [key, post] of after) {
    const pre = before.get(key) ?? [];
    if (pre.length === 0) continue;
    const centre = mean(pre);
    const spread = stddev(pre);
    // The shipped arm is `baseline-localiser.ts`'s rule: a baseline that moved is measured, and one
    // that did not is one step of what the declaration counts. The alternative arm is the behaviour
    // before finding 288, where the absolute constant stood in for that step either way.
    const moved = Math.max(...pre) !== Math.min(...pre);
    const divisor =
      floor === 'relative'
        ? Math.max(spread, Math.abs(centre) * RELATIVE_FLOOR, EPSILON_FLOOR)
        : moved
          ? Math.max(spread, EPSILON_FLOOR)
          : core.resolutionOf(unitByKey.get(key));
    let peak = 0;
    for (const value of post) {
      const z = Math.abs((value - centre) / divisor);
      if (!Number.isFinite(z)) nonFinite += 1;
      peak = Math.max(peak, z);
    }
    if (!Number.isFinite(peak)) nonFinite += 1;
    const service = key.slice(0, key.indexOf('|'));
    peakByService.set(service, Math.max(peakByService.get(service) ?? 0, peak));
  }
  const ranking = [...peakByService.entries()]
    .map(([service, statistic]) => ({ service, statistic }))
    .sort((left, right) =>
      right.statistic !== left.statistic ? right.statistic - left.statistic : left.service.localeCompare(right.service),
    );
  return { ranking, nonFinite };
}

const moved = [];
const kindMoved = [];
let unresolved = 0;
let nonFinite = 0;
const seen = [];

if (index.cases.length === 0) fail(`the corpus at '${casesDir}' names no case`);

for (const entry of index.cases) {
  const faultCase = readJson(join(casesDir, entry.case), `case '${entry.caseId}'`);
  const declared = readJson(join(casesDir, entry.signals), `signals of '${entry.caseId}'`);
  const graph = readJson(join(casesDir, entry.graph), `graph of '${entry.caseId}'`);
  const parameters = faultCase.fault?.parameters ?? {};
  const when = { windowStart: faultCase.window.start, onset: faultCase.injectTime, windowEnd: faultCase.window.end };

  const own = declared.series.map((one) => {
    const resolved = readings({ ...one }, parameters, `${entry.caseId}:${one.metric}`);
    if (resolved.unresolved > 0) unresolved += 1;
    return { ...one, baseline: resolved.baseline, post: resolved.post };
  });
  const quiet_ = core.backgroundSeries(own, background.declaration.series);
  const signals = [];
  for (const one of own) for (const sample of core.expandSeries(one, when)) signals.push(sample);
  for (const one of quiet_) for (const sample of core.expandSeries(one, when)) signals.push(sample);

  const onsetMs = Date.parse(faultCase.injectTime);
  const shipped = rankByPeakZ(signals, onsetMs, 'epsilon');
  const relative = rankByPeakZ(signals, onsetMs, 'relative');
  nonFinite += shipped.nonFinite + relative.nonFinite;

  const answer = faultCase.groundTruth.rootCauseComponent;
  const shippedRank = shipped.ranking.findIndex((one) => one.service === answer) + 1;
  const relativeRank = relative.ranking.findIndex((one) => one.service === answer) + 1;
  const shippedKind = core.classifyDisplacement({ graph, case: faultCase, ranking: shipped.ranking }).kind;
  const relativeKind = core.classifyDisplacement({ graph, case: faultCase, ranking: relative.ranking }).kind;

  seen.push({
    caseId: entry.caseId,
    answer,
    shippedRank,
    relativeRank,
    shippedKind,
    relativeKind,
    shippedTop: shipped.ranking[0]?.service ?? 'none',
    relativeTop: relative.ranking[0]?.service ?? 'none',
  });
  if (shippedRank !== relativeRank) moved.push(seen[seen.length - 1]);
  if (shippedKind !== relativeKind) kindMoved.push(seen[seen.length - 1]);
}

if (!quiet) {
  for (const one of seen) {
    const flag = one.shippedRank !== one.relativeRank || one.shippedKind !== one.relativeKind ? 'MOVED' : '     ';
    console.log(
      `${flag} ${one.caseId}  answer '${one.answer}' rank ${String(one.shippedRank)} -> ${String(one.relativeRank)}` +
        ` (top '${one.shippedTop}' -> '${one.relativeTop}'), kind ${one.shippedKind} -> ${one.relativeKind}`,
    );
  }
}

for (const one of kindMoved) {
  console.error(
    `probe-z-floor: '${one.caseId}' is classified ${one.shippedKind} under the shipped floor and ` +
      `${one.relativeKind} under a relative one -- how its non-answer is described depends on the floor`,
  );
}
// The distinction the corpus's claim turns on. `checkDiscrimination` accepts a case only when a
// separate component is strictly louder, so a kind that moves between `same-component` and `none` is
// a change in how a *non*-displacement is described; only a move into or out of `strict` would mean
// the corpus's evidence is the floor rather than the data.
const strictMoved = kindMoved.filter((one) => one.shippedKind === 'strict' || one.relativeKind === 'strict');
console.log(
  `probe-z-floor: ${String(moved.length)} of ${String(seen.length)} case(s) put the answer at a different rank ` +
    `(one resolution of the declared unit versus ${String(RELATIVE_FLOOR * 100)}% of |baseline|); ` +
    `${String(kindMoved.length)} change kind, ${String(strictMoved.length)} of them into or out of strict; ` +
    `${String(unresolved)} unresolved reading(s), ${String(nonFinite)} non-finite statistic(s)`,
);