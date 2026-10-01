/**
 * The category keyword rows, as the *reading* modules use them.
 *
 * Extracted from `denial-inventory.ts` when `component-agreement.ts` arrived and needed the
 * same table. The extraction is not a tidy-up: two readings that each carried their own copy
 * of the vocabulary could disagree about what a word means, and the disagreement would look
 * like a difference between the *readings* rather than a difference between their tables.
 * One table, two readers.
 *
 * ## Why this is a copy of `collector.ts` rather than an import of it
 *
 * This is the load-bearing decision, and it is the one finding 95 is about. `fault/collector.ts`
 * owns the *classifier's* table -- the one that decides which category an answer's slug names.
 * These readings must be able to **disagree** with that classifier. Importing it would make
 * "the vocabulary says this word belongs to this category" and "the reading found this word
 * here" the same act, and a reading that cannot disagree with the thing it is reading cannot
 * report on it.
 *
 * The duplication is therefore deliberate and it is **checked**: a test asserts that this table
 * and the classifier's agree on every category they share, so a change to one without the other
 * fails rather than drifts. That is the difference between a copy and a second opinion.
 *
 * ## And the part that test does not cover: row order
 *
 * Agreement on *terms* is not agreement on *rows*. `substringReading` iterates
 * `Object.entries(CATEGORY_TERMS)`, so wherever two rows both match a slug the **iteration order**
 * decides the answer -- and the order here is pinned for no reader at all. On the 19-sample corpus
 * exactly two slugs are matched by two rows:
 *
 *   - `redis-latency` matches `middleware` (via `redis`) and `network` (via `latency`);
 *   - `feature-flag-misconfiguration` matches `middleware` (via `lag`) and `config` (via `config`).
 *
 * Measured over all 5040 orders of the seven rows, the reading produces **4 distinct verdict
 * vectors** for the corpus, so its answer is not a function of the data alone. The order below
 * tests `middleware` before `config`, which is what makes `feature-flag-misconfiguration` derive
 * `middleware` -- the single disagreement with the labels that `assessDiscriminatingPower` reports
 * as 1 of 19 and that `assessDownstreamAgreement`'s refutation rests on.
 *
 * That is a **different defect from finding 95's**. Finding 95 was about the *matcher*
 * (`String.includes` over the whole slug, replaced by a word-boundary matcher in `collector.ts`);
 * this survives any matcher, because two matching rows are ordered by iteration whatever the
 * matcher is. The cost is therefore stated here and pinned by group R rather than left to be
 * rediscovered: the shipped order is a decision with a consequence, and the consequence is a
 * corpus figure.
 */
export const CATEGORY_TERMS: Readonly<Record<string, readonly string[]>> = {
  middleware: ['database', 'db', 'redis', 'kafka', 'mq', 'queue', 'cache', 'sql', 'mysql', 'postgres', 'lag'],
  network: ['network', 'latency', 'delay', 'loss', 'partition', 'bandwidth', 'dns', 'packet', 'drop', 'net'],
  resource: ['cpu', 'memory', 'mem', 'disk', 'stress', 'capacity', 'oom', 'saturation', 'leak'],
  runtime: ['pod', 'kill', 'crash', 'restart', 'evict', 'container', 'panic'],
  code: ['exception', 'error', 'bug', 'null', 'stack', 'throw', 'logic', 'regex', 'backtracking'],
  config: ['config', 'setting', 'env', 'yaml', 'property', 'mismatch'],
  dependency: ['dependency', 'upstream', 'downstream', 'third-party', 'sdk', 'library'],
};
