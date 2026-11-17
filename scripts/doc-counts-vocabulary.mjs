// The one definition of "this row claims to describe the state at this commit", and of which
// suite a published count is about.
//
// Two scripts face the first predicate from opposite sides:
//
//   `check-doc-counts.mjs`   reads such a row and requires it to equal today's count
//   `measure-doc-counts.mjs` writes such a row, because it is the only row whose
//                            numbers a measurement may replace
//
// and three face the second:
//
//   `check-doc-counts.mjs`   reads a row's scope and checks the numbers against that suite
//   `measure-doc-counts.mjs` rewrites the row whose scope a run just measured
//   `doc-counts-rows.mjs`    spawns one run per scope and picks the row to rewrite
//
// If they disagree, the failure is silent in one direction and destructive in the
// other: a writer whose marker list is a superset rewrites a *dated record* -- the
// numbers a past pass measured, which are supposed to differ from today's -- and a
// writer whose list is a subset leaves the current row stale while reporting
// success. Neither shows up as an error anywhere; both show up as a document that
// quietly stopped being true.
//
// So the list lives in one place, and it is a plain data module: no `main`, no
// exit, nothing for the inventory to enumerate. `scripts-are-classified.test.ts`
// files it as `data` for that reason.
//
// ## `SCOPES` is the vocabulary, and `scopeOf` is derived from it
//
// The scope words used to exist only as the union of what a chain of `if`s happened to
// test: `core`, then `cli`, then `repo or every workspace`, then `null`. Nothing listed
// them, so nothing could say whether this classifier, the writer's `SCOPES` and the
// checker's own `SCOPES` agreed -- and one of the three was a chain rather than a table.
// This round made the list the source and the classifier a function of it (finding 565).
//
// Two answers are possible, and both are honest: the name of the one scope the label
// names, or `null`. `null` is not a soft answer. Rule 1 of `check-doc-counts.mjs` refuses
// a published count whose scope is `null`, so an ambiguous label becomes a sentence an
// author can act on ("say which one it measured") instead of a guess made on their behalf.
//
// ## Why the word has to stand alone
//
// `\b` treats `-` and `/` as boundaries, so `` `scripts/publish-cli.mjs` `` used to be read
// as a claim about the cli suite and `packages/core` as a claim about core. A file's name
// is not a statement about which suite a number describes, and the rows in the corpus
// labelled that way carry no count shape -- which is luck, not a rule: one
// `N files, M tests` away from being checked against the wrong suite.
//
// ## Why these two phrases and no others
//
// Both are statements that the row describes *now*: `(as of this commit)` and
// `current state`. Phrases like `unchanged (docs only)` and `one more than Pass 32`
// are comparisons to a predecessor and are historical by construction -- the
// checker learned that on its first live run, when reading `one more than Pass 32`
// as "now" made it fire the moment any test was added anywhere.
export const CURRENT_MARKERS = ['as of this commit', 'current state'];

/** The suites a published count can be about. The list itself, not the union of some branches. */
export const SCOPES = ['core', 'cli', 'repo'];

/**
 * What each scope means, in the words a refusal uses.
 *
 * These were the checker's private object and no message printed them: only its keys were
 * read, twice. A value the reader never sees is a value the reader of the code believes is
 * shown to operators -- and the `repo` entry (`every workspace, i.e. pnpm test`) had already
 * leaked into the classifier as a *matching alternative*, which is how a dead string became
 * a live guess. `check-doc-counts.test.ts` asserts the refusal prints all three.
 */
export const SCOPE_NOTES = {
  core: '`packages/core`',
  cli: '`packages/cli`',
  repo: 'every workspace, i.e. `pnpm test`',
};

/**
 * The name standing on its own -- not inside a path, an identifier or a hyphenated word.
 *
 * The negated classes are what `\b` gets wrong: `\bcli\b` matches the tail of
 * `publish-cli`, and `core` matches the last segment of `packages/core`. Delimited this
 * way, a scope word is something an author wrote *about* the row rather than something the
 * row happens to contain.
 */
const STANDING = new Map(SCOPES.map((scope) => [scope, new RegExp(`(^|[^\\w\\-/])${scope}([^\\w\\-/]|$)`)]));

/**
 * Which scope a row declares, read from its own label cell: one name, or `null`.
 *
 * Textual and narrow on purpose, for the reason in the header. Both the checker and the
 * writer call this; if they did not, the writer would rewrite the row the checker does not
 * read, and the document would be updated in one place while the guard looked at another.
 *
 * This is the only function in the module, and it is why the module is no longer described
 * as "a table": a table cannot be wrong, and a classifier that decides which published
 * numbers are true can. It is proved by `doc-counts-vocabulary.test.ts`, the one test in the
 * tree that imports this file -- which is also the rule `scripts-are-classified.test.ts` now
 * enforces for every `data` module that exports a function.
 */
export function scopeOf(label) {
  const lower = label.toLowerCase();
  const named = SCOPES.filter((scope) => STANDING.get(scope).test(lower));
  return named.length === 1 ? named[0] : null;
}
