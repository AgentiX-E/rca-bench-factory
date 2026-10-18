// The comparison the Golden Master verifier performs, separated from doing it.
//
// `verify.mjs` imports the built package, re-exports the committed fixture and
// hands the two maps here. The split exists because of a measurement: the suite
// runs this comparison too, and a suite-run that spawned `verify.mjs` would read
// `packages/core/dist` while other test files mutate `src` and rebuild -- a false
// red that comes and goes with worker scheduling. Pure comparison has no such
// dependency, and the test can drive every branch directly.
//
// Two fields are compared per file, and they are compared separately on purpose:
//
//   sha256  the identity of the bytes
//   bytes   the length of the bytes
//
// The second one used to be recorded and never read. A field that is written and
// never checked is worse than an absent one, because a reader takes it as checked.

/**
 * Compare an anchor table against what the exporter produced.
 *
 * @param {Record<string, string>} groups - group name to a map of path to anchors.
 * @param {Record<string, Record<string, {sha256?: string, bytes?: number}>>} actual
 *   group name to a map of path to what was produced.
 * @returns {string[]} one line per disagreement, empty when everything matches.
 */
export function compareAnchors(groups, actual) {
  const failures = [];
  for (const group of Object.keys(groups)) {
    const exp = groups[group] ?? {};
    const act = actual[group] ?? {};
    // The union, not one side: a file in the anchor and absent from the export is
    // a regression, and a file in the export and absent from the anchor is an
    // unverified file. `Object.keys(exp)` alone would report the first and hide
    // the second.
    const keys = new Set([...Object.keys(exp), ...Object.keys(act)]);
    for (const key of keys) {
      if (exp[key]?.sha256 !== act[key]?.sha256) {
        failures.push(
          `${group}/${key}: sha256 expected ${exp[key]?.sha256 ?? '<missing>'} got ${act[key]?.sha256 ?? '<missing>'}`,
        );
      }
      if (exp[key] !== undefined && exp[key].bytes !== act[key]?.bytes) {
        failures.push(
          `${group}/${key}: bytes expected ${exp[key].bytes} got ${act[key]?.bytes ?? '<missing>'}`,
        );
      }
    }
  }
  return failures;
}
