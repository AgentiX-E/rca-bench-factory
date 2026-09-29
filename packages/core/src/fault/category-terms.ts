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
