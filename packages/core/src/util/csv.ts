/**
 * Minimal RFC 4180 CSV reader and writer.
 *
 * The official OpenRCA evaluator consumes `record.csv` and `groundtruth.csv`
 * through `pandas.read_csv`, and the fields it cares about (`prediction`,
 * `scoring_points`) legitimately contain commas, double quotes and embedded
 * newlines. Reading them with `String.prototype.split(',')` therefore silently
 * corrupts the ground truth, so the reader here implements the quoting rules
 * instead of approximating them.
 *
 * Supported, per RFC 4180:
 *  - fields separated by commas;
 *  - fields optionally wrapped in double quotes;
 *  - a doubled double quote (`""`) inside a quoted field is a literal quote;
 *  - rows separated by LF or CRLF;
 *  - a trailing newline does not produce an empty trailing row.
 */

/**
 * A CSV cell value.
 *
 * `undefined` and `null` are part of the type because the exporters write
 * positional rows, and an optional IR field that is absent still occupies its
 * column. Accepting them here is what makes the absent-value rule below
 * expressible in one place instead of at every call site.
 */
export type CsvCell = string | number | undefined | null;

/**
 * Quote one cell if it contains a comma, a double quote or a newline.
 *
 * An absent value becomes an empty cell. That is the only spelling of "nothing
 * observed" a CSV can carry: `String(null)` produces the four characters
 * `null`, which a reader cannot distinguish from a value someone actually
 * recorded. The distinction matters because the consumers are benchmark
 * scorers -- a parent span id of `null` is a span that claims a parent.
 *
 * The type is the full `CsvCell` union even for callers that never pass an
 * absent value. A narrower signature would let a caller's `?? ''` be the only
 * thing standing between a missing field and a fabricated one, and that
 * default is exactly what two private copies of this helper used to disagree
 * about.
 */
export function csvCell(value: CsvCell): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Render a header and its rows as CSV text with a trailing newline.
 *
 * The trailing newline is part of the format rather than a courtesy: a file
 * without it is read as one unterminated record by some tools, and the
 * Golden Master anchors hash these bytes.
 */
export function renderCsv(header: string[], rows: CsvCell[][]): string {
  return [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n';
}

/**
 * Split one CSV text into rows of raw field values, one record at a time.
 *
 * ## Why the parser is a generator
 *
 * `parseCsvRows` returned an array, which made every caller hold every record
 * before it could look at the first one. The corpus's largest `logs.csv` is
 * **202 258 338 bytes** -- 274 621 records of seven fields, one of them a log
 * message -- and turning that into an array of arrays costs several times the
 * text. `scripts/check-aggregate-tables.mjs` did exactly that, on every case, and
 * the first TrainTicket case took the process past a 4 GB heap (finding 533) --
 * before it had discovered that the file has no `log_template` column, which is
 * the only thing it wanted to know.
 *
 * The rule itself is unchanged: this is the same loop, with `yield` where it used
 * to be `rows.push`, and `parseCsvRows` is now `[...iterateCsvRows(text)]`. One
 * parser under two drivers rather than two copies of the quoting rules, because a
 * second copy is a second thing that can disagree about `""`.
 */
export function* iterateCsvRows(text: string): Generator<string[]> {
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === '') {
      quoted = true;
      started = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      started = true;
      continue;
    }
    if (ch === '\r') {
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      yield row;
      row = [];
      field = '';
      started = false;
      continue;
    }
    field += ch;
    started = true;
  }

  // A file that does not end with a newline still ends a row.
  if (started || field !== '' || row.length > 0) {
    row.push(field);
    yield row;
  }
}

/**
 * Split one CSV text into rows of raw field values.
 *
 * The whole file at once, for the callers that want it: a Golden Master fixture is
 * a kilobyte and an evaluator's `record.csv` is a page. A caller reading corpus-scale
 * telemetry wants `iterateCsvRows` instead, and the difference is the reason that
 * function exists.
 */
export function parseCsvRows(text: string): string[][] {
  return [...iterateCsvRows(text)];
}

/**
 * Split one CSV text into records keyed by the header row.
 *
 * Rows shorter than the header are padded with empty strings; a row longer than
 * the header keeps its extra values under the empty key so nothing is lost.
 */
export function parseCsvObjects(text: string): Array<Record<string, string>> {
  const rows = parseCsvRows(text);
  const header = rows[0];
  if (header === undefined) return [];

  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = row[index] ?? '';
    });
    return record;
  });
}

/** Read one column from a CSV text; missing rows yield an empty string. */
export function csvColumn(text: string, column: string): string[] {
  return parseCsvObjects(text).map((record) => record[column] ?? '');
}
