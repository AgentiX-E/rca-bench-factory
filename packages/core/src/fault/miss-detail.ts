/**
 * Read a published miss detail annotation back into rows.
 *
 * The channel is one `::notice` line whose body is every per-sample miss,
 * `sample.field:expected>actual`, joined by a separator. It is the only place the
 * model's actual answers are recorded, so every question of the form "what did it
 * say, and was that a form variant or a different fault" is answered here or
 * nowhere.
 *
 * ## Why this module exists
 *
 * Finding 91 quoted a figure about this channel that came from a transcription of
 * a *different run*. The transcription (`scripts/probe-type-misses.mjs`,
 * `RECORDED_TYPE_MISSES`) was byte-exact against the run it named; it was simply
 * not the run being discussed. Eight of fourteen rows disagreed with the
 * annotation, and two rows were attributed a `type` miss that their run assigned
 * to `component`.
 *
 * The cause was not carelessness at transcription time. It was that **nothing read
 * the channel**. The workflow writes it, and the only consumer carried a copy of
 * one run's contents instead of a reader for the channel, because the channel
 * lives in CI and reading it needs a token, a run id, and a check-run lookup. A
 * figure that cannot be re-derived is worth less than one whose provenance is
 * stated, so the copy was an honest convenience -- and it became a defect the
 * moment it was quoted as current.
 *
 * ## The separator changed, and both separators are still in the record
 *
 * Run `9932e766c` joined rows with a space. Run `567118aea` joined them with
 * U+001F. That change is finding 70's fix and it was correct: values contain
 * spaces (`order-service ConfigMap`, `tax-calculation provider`,
 * `billing service database client pool`), so a space join cannot be split
 * unambiguously, and a whitespace split manufactured rows reading
 * `order-service -> order-service` -- two cases of the scorer apparently marking
 * a correct answer wrong. The scorer was right; the channel was ambiguous.
 *
 * Both separators therefore have to be read. Not for compatibility's sake: the
 * space-separated runs are already published and immutable, and they are the only
 * evidence of what the model said before the separator changed. A reader that
 * handled only the current separator would throw away the comparison, which is the
 * one thing a run record is for.
 *
 * The space form is readable anyway, and without guessing where the space goes,
 * because each row is a *sequence of fields* rather than free text:
 *
 *     <sample-id>.<field>:<expected>><actual>
 *
 * `sample-id` and `field` are slugs, `field` is one of four known names, and
 * `expected` is a slug. So the row is anchored at the left by a slug, a dot, and a
 * known field name, and the ambiguity lives entirely in `actual`, which is the
 * last token of the row and may contain spaces. Between rows there is nothing but
 * the separator. Splitting on the separator therefore yields exactly the rows, and
 * within a row the split points are found by position rather than by whitespace.
 *
 * This module never splits on whitespace. That is the property, not an
 * implementation detail.
 */

import { SCORED_FIELDS, type ScoredField } from './extraction-scoring.js';

/**
 * The annotation title this module reads.
 *
 * Exported so the workflow's literal and the reader's expectation can be compared
 * by a test. The two are the halves of one contract and only one of them is
 * compiled, so the other has to be asserted against the workflow text.
 */
export const MISS_DETAIL_TITLE = 'M1 fault extraction miss detail';

/** The suffix the workflow appends when it truncates the list. */
const TRUNCATION_MARKER = /\.\.\. \[\d+ more row\(s\) omitted; all \d+ are in the step summary\]$/;

/** One miss: which sample, which field, what was expected, what came back. */
export interface MissDetailRow {
  /** The golden sample id, e.g. `resource-cpu-saturation-checkout`. */
  sampleId: string;
  /** The scored field the miss belongs to. */
  field: ScoredField;
  /** The slug the dataset states. */
  expected: string;
  /**
   * The model's answer, or `null` when it answered nothing.
   *
   * The scorer prints the literal `(omitted)` because the report is prose meant to
   * be read; here it becomes `null` because an omission and a wrong answer are
   * different findings, and `missClassification` exists to separate them. Keeping
   * the parentheses would report an omission as a wrong answer whose text happens
   * to read `(omitted)`.
   */
  actual: string | null;
}

/**
 * The left anchor of a row: a slug, a dot, and a known field name.
 *
 * This is the whole of the space-separated reader. See `splitRows`.
 */
const ROW_ANCHOR = new RegExp(`^[a-z0-9-]+\\.(?:${SCORED_FIELDS.join('|')}):`);

/**
 * Split a body into rows, on whichever separator it uses.
 *
 * U+001F is tried first because it is the current format and because a body that
 * contains one cannot be a space-joined body -- U+001F can occur in no value, so
 * its presence is conclusive. A body with no U+001F is read as space-joined, which
 * is what every run before finding 70 published.
 *
 * ## The space-separated form is not a split, and cannot be
 *
 * A plain `split(' ')` is wrong, and the reason is the reason finding 70 changed
 * the separator: values contain single spaces. Measured on the recorded run
 * `9932e766c`: splitting its 38 rows on spaces yields **56 tokens**, of which 38
 * are rows and 18 are fragments -- `network`, `path`, `node`, `egress`,
 * `interface`, `native`, `binding`, `Redis`, `service`, `database`, `client`,
 * `pool`, `writer`, `rule`, `ConfigMap`, `provider`, `applier`, `thread`. Every
 * fragment is the tail of a row's `actual`.
 *
 * Those fragments are recoverable, because a row is *anchored*: it begins with a
 * slug, a dot, and a name from a closed set of four. A token that matches the
 * anchor starts a row; a token that does not is a continuation of the row before
 * it. Rejoining on that rule recovers all 38 rows with the multi-word values
 * intact -- `cart-to-inventory network path`, `billing service database client
 * pool`, `order-service ConfigMap`.
 *
 * The rule is decidable but it is not *sound*, and the difference is the point.
 * It fails on an `actual` that itself begins `<slug>.<field>:` -- the model would
 * have to answer a field with a string shaped like a different row's key. Nothing
 * in the record rules that out; the separator was changed precisely because a
 * channel that can only be read by a convention that the data is not bound to is
 * not a channel. So this reader reads the old form because the old form is the
 * only evidence of what the model said before the change, and it says so here
 * rather than presenting the recovery as exact.
 */
function splitRows(body: string): string[] {
  if (body.includes('\u001f')) {
    return body.split('\u001f').filter((token) => token !== '');
  }
  if (!body.includes(' ')) {
    return [];
  }
  // The space-separated form: rejoin fragments onto their anchor.
  const rows: string[] = [];
  let current: string | null = null;
  for (const token of body.split(' ').filter((t) => t !== '')) {
    if (ROW_ANCHOR.test(token)) {
      if (current !== null) {
        rows.push(current);
      }
      current = token;
    } else if (current !== null) {
      current = `${current} ${token}`;
    } else {
      // A fragment before any anchor. Appending it to a row that does not exist
      // would silently drop it, and a dropped row reads as a better run.
      rows.push(token);
    }
  }
  if (current !== null) {
    rows.push(current);
  }
  return rows;
}

/**
 * Match one row, anchored at the left.
 *
 * The shape is `<sample-id>.<field>:<expected>><actual>` where the ids and the
 * expected value are slugs. `actual` is captured as the remainder of the row, so
 * it may contain spaces and the `>` that opens it is the first one in the row.
 *
 * Anchoring on the field name rather than on a position is what makes the
 * space-separated form readable: the alternative is to assume `actual` is a single
 * token, which is false for `log-collector-data-volume` and
 * `cart-to-inventory network path`.
 */
const ROW = new RegExp(
  '^([a-z0-9-]+)\\.(' +
    SCORED_FIELDS.join('|') +
    '):([^>]+)>(.*)$',
);

/**
 * True when the body carries the truncation suffix the workflow appends.
 *
 * The workflow caps the published rows at 60 and, when it drops any, appends
 * `... [N more row(s) omitted; all M are in the step summary]`. A reader that
 * ignored the suffix would report the capped list as the whole list, and a short
 * list of misses reads as a *better* run -- the inversion finding 90 was about.
 *
 * This is a function rather than a field because the two callers want different
 * things from it: `parseMissDetail` strips the suffix so the last row stays
 * readable, and `readMissDetail` reports it so a partial reading is labelled as
 * partial. Leaving it exported for the second caller is why it is not private.
 */
export function isTruncated(body: string): boolean {
  return TRUNCATION_MARKER.test(body.trim());
}

/** The rows of a body, with whether the body was a complete list. */
export interface MissDetailReading {
  rows: MissDetailRow[];
  /**
   * False when the workflow dropped rows from this body.
   *
   * Always present, and specifically `false` rather than absent when the list is
   * whole: a caller that has to distinguish "complete" from "unknown" will
   * eventually treat unknown as complete, and the whole channel exists because a
   * partial reading that looks whole is the failure mode.
   */
  complete: boolean;
}

/**
 * Parse the body into rows and say whether it was the whole list.
 *
 * Distinct from `parseMissDetail` only by reporting truncation, and that is the
 * point: the rows are the same, and a caller that reads `rows` without `complete`
 * is making the mistake this type exists to make visible.
 */
export function readMissDetail(body: string): MissDetailReading {
  return { rows: parseMissDetail(body), complete: !isTruncated(body) };
}

/**
 * Parse the annotation body into rows.
 *
 * Throws when the body yields no rows. An empty list and an unreadable body are
 * different findings: the channel's whole purpose is that its absence is noticed,
 * and returning `[]` for `''` would let a broken extraction read as a run with no
 * misses -- which is the best possible result and therefore the worst possible
 * misreading.
 */
export function parseMissDetail(body: string): MissDetailRow[] {
  const trimmed = body.trim();
  if (trimmed === '') {
    throw new Error('miss detail body is empty; an absent reading is not a clean run');
  }

  // The truncation suffix is appended after the last row and would otherwise be
  // read as part of that row's `actual`. It is stripped rather than rejected: a
  // truncated body is still a reading of the rows it carries, and
  // `isTruncated` exists so a caller can say the list is partial.
  const text = trimmed.replace(TRUNCATION_MARKER, '');

  const tokens = splitRows(text);
  if (tokens.length === 0) {
    // A body with neither separator is a single row only if that row is well
    // formed. A one-row body is a legitimate thing to hold -- the workflow would
    // publish one if exactly one field missed -- so it is read as one row rather
    // than rejected for lacking a separator it would not have.
    tokens.push(text);
  }

  const rows: MissDetailRow[] = [];
  const unreadable: string[] = [];
  for (const token of tokens) {
    const match = ROW.exec(token.trim());
    if (match === null) {
      unreadable.push(token);
      continue;
    }
    const [, sampleId, field, expected, actual] = match as unknown as [
      string,
      string,
      ScoredField,
      string,
      string,
    ];
    rows.push({
      sampleId,
      field,
      expected,
      actual: actual === '(omitted)' ? null : actual,
    });
  }

  if (unreadable.length > 0) {
    // Named rather than counted. A silently skipped row turns a reader defect into
    // a shorter reading, and a shorter reading of this channel reads as a better
    // run -- the same inversion finding 90 was about.
    throw new Error(
      `miss detail body carries ${unreadable.length} row(s) that do not match ` +
        `<sample>.<field>:<expected>><actual>: ${unreadable.slice(0, 3).map((t) => JSON.stringify(t)).join(', ')}`,
    );
  }
  return rows;
}
