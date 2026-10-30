// The one relation between the three published suite counts, computed.
//
// ## The defect this exists for
//
// `golden-master/doc-counts.json` holds three measurements -- `core`, `cli`, and
// `repo` (every workspace) -- taken by three separate runs and published side by
// side. Nothing computed the relation that has to hold between them: two of the
// numbers are parts of the third.
//
// On the round that added this file the committed measurement read
//
//   core 199 files / cli 4 files / repo 202 files
//
// and `199 + 4 = 203`. The 199 was typed rather than measured: the pass that
// wrote it counted `packages/core/test/**/*.test.ts` by hand and came out one
// file high. It survived a green `docs:check`, a green `check-doc-counts`, and a
// green `pnpm test`, because every one of those compares a *document* to the
// declaration. The only step that compares the declaration to a run is
// `measure-doc-counts.mjs --check --from <report>`, which needs two vitest
// reports and therefore runs only inside `verify:local`.
//
// So the table was arithmetically inconsistent for a whole round. That is the
// same shape as finding 302 one level up: two counts, each true of its own
// scope, and no comparison between them. A number whose only reader checks that
// the prose agrees with it is a number that can be wrong for as long as nobody
// adds it up.
//
// ## Why a module rather than four lines inside the guard
//
// `check-doc-counts.mjs` is a gate: it has failure exits, it is fingerprinted by
// `derive-gate-sites.mjs`, and `scripts-are-classified.test.ts` files it as
// `gate`. A rule written inside a gate can only be proved by mutating the gate,
// which is what the doc-count shape battery does and is expensive per rule. Here
// the rule is a pure function in a `data` module, so a test can hand it three
// numbers and read the verdict -- and the guard's job is only to call it and add
// the problems to its own list.
//
// It also has to be plain JavaScript. `check-doc-counts.mjs` runs in the cold-tree
// job, which has no build, so it may not import from `packages/core/dist`.
//
// ## Why a partial measurement is silent
//
// `check-doc-counts.mjs` takes `--measured <json>` so a caller can hand in the
// scope it is talking about, and several tests hand in one scope. Asserting the
// relation whenever it is not obeyed would turn those into failures about a scope
// they never mentioned. So the rule applies to a *complete* measurement and says
// nothing about an incomplete one: an incomplete measurement is not making a
// claim about the whole. The gap stays visible through rule 3 of the guard, which
// refuses a row marked as the current state when its scope has no live
// measurement.

/**
 * Which scopes are parts of which, for the numbers published in
 * `docs/progress.md` and declared in `golden-master/doc-counts.json`.
 *
 * Exported rather than inlined so a second caller -- a report, a probe -- names
 * the same relation instead of restating it. Adding a workspace is then one edit
 * here and one entry in the guard's `SCOPES`, and the arithmetic follows.
 */
export const ADDITIVE_SCOPES = { parts: ['core', 'cli'], whole: 'repo' };

/** The two units a measurement carries. Both are counts and both must add up. */
const UNITS = ['files', 'tests'];

function countOf(measured, scope, unit) {
  const entry = measured === null || typeof measured !== 'object' ? undefined : measured[scope];
  if (entry === null || typeof entry !== 'object') return undefined;
  const value = entry[unit];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Report every unit whose parts do not add up to the whole.
 *
 * One problem per unit rather than one per measurement, because the two units
 * fail independently: a mistyped file count and a stale test count are two
 * different mistakes and a reader has to be able to tell which one happened.
 */
export function checkCountAdditivity(measured, relation = ADDITIVE_SCOPES) {
  const { parts, whole } = relation;
  if (parts.length === 0) {
    return [
      'the additivity relation names no parts, so obeying it would assert that ' +
        `'${whole}' is zero. A relation with nothing to sum is not a measurement: it would pass ` +
        'for a measurement that is entirely missing, which is the defect it is supposed to catch.',
    ];
  }

  // Complete measurements only. A missing scope is reported by the guard's own
  // rule 3 when a row claims to be current, and by `measure-doc-counts.mjs` when
  // the file is retaken -- not here, where a scope that was never handed in would
  // be a complaint about the caller rather than about the numbers.
  const complete = [...parts, whole].every((scope) => UNITS.every((unit) => countOf(measured, scope, unit) !== undefined));
  if (!complete) return [];

  const problems = [];
  for (const unit of UNITS) {
    const sum = parts.reduce((total, scope) => total + countOf(measured, scope, unit), 0);
    const declared = countOf(measured, whole, unit);
    if (sum === declared) continue;
    const spelled = parts.map((scope) => `'${scope}' ${String(countOf(measured, scope, unit))}`).join(' + ');
    // The sign, not the magnitude: `+1` says a part gained a file and `-8` says
    // one lost eight tests, and those are different mistakes in different files.
    const off = declared - sum;
    problems.push(
      `the '${whole}' ${unit} count is not the sum of its parts: ${spelled} = ${String(sum)}, ` +
        `and '${whole}' says ${String(declared)} (off by ${off > 0 ? '+' : ''}${String(off)}). ` +
        'These three numbers are measured separately and published side by side, so this is the ' +
        'one relation that has to hold between them and nothing was computing it: a part typed ' +
        'rather than read leaves three published numbers disagreeing with each other while every ' +
        'guard that reads them stays green.',
    );
  }
  return problems;
}
