#!/usr/bin/env node
/**
 * The progress log as a corpus: the index and every volume, in reading order.
 *
 * ## Why this exists
 *
 * `docs/progress.md` was split into an index and four volumes (finding 197). Two
 * guards read published test counts out of that document -- `check-doc-counts.mjs`
 * and `measure-doc-counts.mjs` -- and both were reading **one path**. That path is
 * now 69 KB of an 521 KB corpus, so the checker would report "no file/test counts
 * found" over the file that still contained them, and the writer would report
 * success over a number it had never seen.
 *
 * That is the same defect the audit split produced, in the same campaign, one
 * document over: **a check whose scope shrank while its verdict stayed green** --
 * except this one went red, which is the difference between a guard and a habit.
 *
 * ## Why the order is the reading order
 *
 * The index is the live state and the volumes are the record. A monotonicity rule
 * over published counts ("a suite that lost tests is a regression or a mislabelled
 * scope") is only meaningful if the rows are read in the order they were written,
 * so the corpus is `docs/progress.md` first and then `volume-01`, `volume-02`, ...
 * in numeric order -- not the order the filesystem happens to return.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');

/**
 * Every file that carries published counts, as `{ label, path, text }`.
 *
 * `label` is what a message says, because a line number without a file in a
 * five-file corpus is a number a reader cannot act on.
 *
 * A missing `docs/progress/` is not an error here: the split is recent, and a
 * corpus of one file is what the checks saw for the whole campaign before it. The
 * volume guard is what refuses an index with no volumes behind it.
 */
export function progressCorpus(root = ROOT) {
  const index = join(root, 'docs', 'progress.md');
  const files = [{ label: 'docs/progress.md', path: index, text: readFileSync(index, 'utf8') }];
  let names;
  try {
    names = readdirSync(join(root, 'docs', 'progress')).filter((name) => /^volume-\d+\.md$/.test(name)).sort();
  } catch {
    return files;
  }
  for (const name of names) {
    files.push({
      label: `docs/progress/${name}`,
      path: join(root, 'docs', 'progress', name),
      text: readFileSync(join(root, 'docs', 'progress', name), 'utf8'),
    });
  }
  return files;
}
