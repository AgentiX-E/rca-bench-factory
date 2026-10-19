// The one definition of "this row claims to describe the state at this commit".
//
// Two scripts face this predicate from opposite sides:
//
//   `check-doc-counts.mjs`  reads such a row and requires it to equal today's count
//   `measure-doc-counts.mjs` writes such a row, because it is the only row whose
//                            numbers a measurement may replace
//
// If they disagree, the failure is silent in one direction and destructive in the
// other: a writer whose marker list is a superset rewrites a *dated record* -- the
// numbers a past pass measured, which are supposed to differ from today's -- and a
// writer whose list is a subset leaves the current row stale while reporting
// success. Neither shows up as an error anywhere; both show up as a document that
// quietly stopped being true.
//
// So the list lives in one place, and it is a plain data module: no `main`, no
// exit, nothing to prove. `scripts-are-classified.test.ts` files it as `data` for
// that reason.
//
// ## Why these two phrases and no others
//
// Both are statements that the row describes *now*: `(as of this commit)` and
// `current state`. Phrases like `unchanged (docs only)` and `one more than Pass 32`
// are comparisons to a predecessor and are historical by construction -- the
// checker learned that on its first live run, when reading `one more than Pass 32`
// as "now" made it fire the moment any test was added anywhere.
export const CURRENT_MARKERS = ['as of this commit', 'current state'];

/**
 * Which scope a row declares, read from its own label cell.
 *
 * Textual and narrow on purpose: the scope word has to appear in that row's
 * label, so a row that names core cannot be read as repo. A bare `test suite` is
 * ambiguous -- that ambiguity is the defect this vocabulary was created for --
 * and returns null so the reader is forced to say which scope it means.
 *
 * Both the checker and the writer call this. If they did not, the writer would
 * pick the row the checker does not read, and the document would be updated in
 * one place while the guard looked at another.
 */
export function scopeOf(label) {
  const lower = label.toLowerCase();
  if (/\bcore\b/.test(lower)) return 'core';
  if (/\bcli\b/.test(lower)) return 'cli';
  if (/\brepo\b|\bevery workspace\b/.test(lower)) return 'repo';
  return null;
}
