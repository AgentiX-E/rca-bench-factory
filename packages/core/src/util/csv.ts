/**
 * Minimal RFC 4180 CSV reader.
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

/** Split one CSV text into rows of raw field values. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
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
      rows.push(row);
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
    rows.push(row);
  }

  return rows;
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
