#!/usr/bin/env node
/**
 * Reading citations of findings out of the documentation, and saying which resolve.
 *
 * ## The defect this exists for
 *
 * The audit log numbers its findings 1–204, five volumes of them, and every round of
 * `docs/progress.md` cites them by number: "closed by finding 170", "finding 46's fix",
 * "the mechanism finding 39 named". Two hundred and three distinct numbers are cited
 * across 1.6 MB of markdown, and until this module existed **nothing had ever checked that
 * a cited number names something**.
 *
 * Measured on the first run: two do not. `finding 118` is cited by one sentence that says
 * it "names its own misdiagnosis", and `finding 133` is cited by a sentence describing "a
 * diagnostic pass while writing up finding 133" — and neither number has a heading. A
 * reader following either lands nowhere, and the failure is silent because a citation is
 * prose: it reads exactly as convincingly when it is wrong.
 *
 * ## What it cannot do
 *
 * It checks that a number **exists**, not that it is the *right* number. A sentence that
 * cites finding 41 when it meant 42 will pass forever, and no scan can tell: both numbers
 * name findings, and the sentence's claim about either is prose. Stated here rather than
 * left to look like more than it is -- the same trade the open-list guard makes about a
 * fluent reason it cannot refuse.
 *
 * ## Why the numbers are not renumbered
 *
 * The three holes (118, 132–133) stay. Closing them means renumbering 204 findings, which
 * breaks every citation that resolves today in order to fix two that do not -- and the
 * audit log's own rule is that a finding is cited by number. A hole with no citation is
 * invisible; a renumbering is 203 new chances to be wrong.
 */

/** `## Finding 204 — ...` and `## Finding 46 -- ...`, the only spellings the log uses. */
const HEADING = /^## Finding (\d+)\b/gm;

/** `finding 46`, `Finding 39`, `findings 1–42` -- the range form cites its first number. */
const CITATION = /\b[Ff]indings?\s+(\d+)\b/g;

/**
 * Every finding number that has a heading, across the files given.
 *
 * The subject is the whole corpus rather than one file, because a finding is cited from
 * the index, from `docs/progress.md`, from the volumes of both documents, and from the
 * summaries that the audit index writes for its own rows. A reader does not know or care
 * which file holds finding 170, and neither does this.
 */
export function headingsOf(files) {
  const numbers = new Set();
  for (const file of files) {
    for (const match of file.text.matchAll(HEADING)) numbers.add(Number(match[1]));
  }
  return numbers;
}

/**
 * Every citation, with the file and line it is on and the first words of its sentence.
 *
 * The line number is carried because a citation that does not resolve is repaired by
 * editing one sentence, and "somewhere in 1.6 MB" is not a place. The context is the
 * sentence the citation sits in, trimmed, because the repair needs to know what the
 * sentence claims -- `finding 133` in "a diagnostic pass while writing up finding 133"
 * means something different from `finding 133` in "closed by".
 */
export function citationsIn(file) {
  const out = [];
  const lines = file.text.split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(CITATION)) {
      out.push({
        number: Number(match[1]),
        where: `${file.label}:${String(index + 1)}`,
        sentence: sentenceAt(line, match.index ?? 0),
      });
    }
  });
  return out;
}

/**
 * The sentence around an offset, or the whole line when the line holds no sentence break.
 *
 * A sentence, not a paragraph: the audit log's paragraphs run to fifteen lines, and a
 * context field that long would be pasted into a diagnostic nobody reads.
 */
function sentenceAt(line, offset) {
  const before = line.slice(0, offset);
  const start = Math.max(before.lastIndexOf('. '), before.lastIndexOf(' -- '), before.lastIndexOf('; '));
  const rest = line.slice(start === -1 ? 0 : start + 1);
  const end = rest.search(/[.;]\s/);
  return rest.slice(0, end === -1 ? 160 : end).trim().slice(0, 160);
}

/**
 * The citations that name no finding, and the numbers they name.
 *
 * Returned as `{ dangling, numbers }`: the list is what a reader needs, the distinct set
 * is what a summary line prints, and the two are different questions -- one bad number
 * cited six times is one number to fix and six places to fix it.
 */
export function dangling(citations, headings) {
  const missing = citations.filter((one) => !headings.has(one.number));
  const numbers = [...new Set(missing.map((one) => one.number))].sort((a, b) => a - b);
  return { dangling: missing, numbers };
}

/**
 * The numbers between 1 and the highest heading that have no heading.
 *
 * Printed rather than refused, and that is the whole judgement: a hole in the numbering is
 * invisible unless something cites it, and the citations are what `dangling` refuses. When
 * a hole *is* cited, it appears in both lists -- once as an absent number, once as a
 * dangling citation -- and the second one is the one that fails the run.
 */
export function absentNumbers(headings) {
  const highest = headings.size === 0 ? 0 : Math.max(...headings);
  const out = [];
  for (let n = 1; n <= highest; n += 1) if (!headings.has(n)) out.push(n);
  return out;
}
