#!/usr/bin/env node
/**
 * The sizes the live list may state, and the one thing each of them has to carry.
 *
 * ## The defect this exists for
 *
 * `O-019` argues that `docs/acceptance.md` has grown too large to keep growing, and it
 * carried its evidence in the headline: "**`docs/acceptance.md` is 96 KB** and grows by clause
 * per round". The file was 165,067 bytes when the entry was read and 167,552 when this module
 * was written -- which is the argument rather than an accident, because a figure in a sentence
 * that nothing reads moves while the thing it measures moves. So the figure is a copy of a
 * measurement taken once, the thing it measured has grown by three quarters, and the entry that
 * argues a document is too big is the entry quoting a size that is too small. Nothing said so
 * for nineteen rounds, because nothing read the sentence -- the same shape finding 620 repaired
 * one document over, where a census carried a ratio in a sentence and read only the gates.
 *
 * ## What the rule is
 *
 * A figure carrying a unit this tree can take again -- `bytes`, `KB`, `MB`, `lines` --
 * must say **when** it was taken, unless it is this tree's figure at this commit. Both
 * halves are checked; neither is decoration:
 *
 *   `161.2 KB at v3.131`   a record: the round that took it is named, and a record does
 *                          not age
 *   `165,067 bytes`        a claim about now, and accepted only while it is true
 *   `96 KB`                refused, and the refusal names the size the file has
 *
 * ## Why the escape is a date and not "the current size"
 *
 * `docs/acceptance.md` grows in most rounds. A rule that demanded this commit's size would
 * therefore be red on the round after every round that wrote one -- and a rule that is
 * always red is a rule every reader learns to skip, which is the argument the volume
 * budget already makes for judging only the volume that can still grow. A date is what
 * makes a measurement a **record**, and the live list is where a work item's evidence
 * lives: the round that found something is a fact, and a fact with a name does not decay.
 *
 * The census, one document over, demands the opposite -- a figure there must be a count a
 * gate prints **now** (finding 620). The difference is the subject and not a taste: a
 * census sentence describes the vocabulary as it is this minute, so a count in it that no
 * gate prints is a copy of nothing; a live entry describes a defect found at a round, so
 * its numbers are measurements, and the thing a measurement needs is a date.
 *
 * ## Why these four units
 *
 * Because a commit can take them again. `bytes` and `lines` are properties of a file, and
 * the file is in the tree. `439 s` and `84 minutes` are properties of a run that is over:
 * no gate can take them, and a rule about them would be a rule nobody could satisfy except
 * by guessing. What a guard may demand is bounded by what it can measure, and the boundary
 * is here rather than inside a reader who wonders why `888 s` passes.
 *
 * ## What a date cannot do
 *
 * It cannot make a figure true. `96 KB at v3.131` would pass while being wrong, exactly as
 * a ledger's `(as of `sha`)` marker passes while naming a tree it was not measured on
 * (finding 309). The guard's subject is the accident -- a measurement that aged while the
 * thing it measured moved -- and not the lie.
 */

/**
 * The units a commit can take again, and what one of each is worth in the unit below it.
 *
 * `null` is a unit that is counted rather than converted: a file's length is a number of
 * lines, and no line is a fraction of another.
 */
export const SIZE_UNITS = new Map([
  ['byte', 1],
  ['bytes', 1],
  ['KB', 1024],
  ['kB', 1024],
  ['MB', 1024 * 1024],
  ['line', null],
  ['lines', null],
]);

/**
 * A figure and the unit it states, in the order a sentence states them.
 *
 * The separator is required: `96 KB` and `17,846-line` are figures, and `96KB` is a
 * token this corpus has never written. A numeral glued to letters is part of a name and
 * not a count (`check-l4-status`, `v3.129`), which is finding 620's lexical rule and the
 * reason the lookbehind excludes a dot, a hyphen and an underscore as well as a letter.
 *
 * The lookahead after the unit is what stops `line` matching the first four letters of
 * `lines-of-code`, which is a name for a metric rather than a length. The separator is what
 * stops `96KB` being read: this corpus has never written a size without one, and a reader
 * that accepted the glued form would read `L4` as a count of four of something.
 */
export const SIZE = /(?<![\w.\-])(\d[\d,]*(?:\.\d+)?)(?:\s|-)+(bytes?|[Kk]B|MB|lines?)(?![\w])/g;

/**
 * The date a figure may carry, read from what follows it.
 *
 * After and not before, because that is the tree's idiom in every place it dates anything:
 * `(at v3.128)` in a ledger's row, `at v3.131` beside a size, `(as of `sha`)` beside a
 * count. The window is short and the mark-up between the two is allowed for -- the shipped
 * form is `**161.2 KB at v3.131**`, so a bold mark sits between the unit and the date.
 */
const DATED = /^[\s*_,;:()]{0,6}(?:at|as of)\s+(?:v\d+\.\d+|Pass\s+\d+|`[0-9a-f]{7,40}`)/;

/** How far past a figure its date may sit. One phrase, not a paragraph. */
const DATE_WINDOW = 48;

/** A fenced or inline code span, which is how a document of this tree is named. */
const SPAN = /`([^`\n]+)`/g;

/**
 * A sentence ends where a reader would say it does: a full stop, any mark-up that closes a
 * word or a clause, and a space.
 *
 * The mark-up is in the pattern because the corpus writes `round.** L3 is 284 lines` -- a
 * full stop inside a bold mark, followed by the next sentence. Without `[*_)]*` the two
 * sentences read as one, and `L3`'s length was paired with the document's, which is a
 * refusal whose repair would be wrong: `284 lines` measures a section, and the document has
 * a length of its own -- 2,051 lines at v3.131, a number that grows in most rounds and that
 * this comment therefore dates.
 */
const SENTENCE_END = /[.!?][*_)]*\s|\n\n/;

/**
 * A quotation, on one line.
 *
 * A figure inside one is not this list's claim: the list is reporting what another document
 * says, and the sentence it is reporting is the defect. `O-101` could not be written without
 * quoting `O-019`'s `96 KB`, and a rule that refused the quotation would refuse the report --
 * which is the one repair a guard may never demand. The cost is that the guard cannot check
 * a quotation, and it says so instead of pretending: what is quoted is read by whoever owns
 * the words, and an entry that quotes a stale figure is doing its job.
 */
const QUOTED = /"[^"\n]*"|“[^”\n]*”/g;

/**
 * Every figure in a text that carries one of the four units, in order.
 *
 * `dated` is read here rather than left to the caller because a figure and its date are one
 * fact: `**161.2 KB at v3.131**` is a record, and `161.2 KB` is not, and a caller that had
 * to pair them up would be re-reading the same window a second time. `written` keeps the
 * figure as the sentence wrote it, so a refusal can quote rather than paraphrase.
 *
 * A figure inside a quotation is not read at all (see `QUOTED`).
 */
export function sizesIn(text) {
  const quoted = [...text.matchAll(QUOTED)].map((one) => [one.index, one.index + one[0].length]);
  const out = [];
  for (const match of text.matchAll(SIZE)) {
    if (quoted.some(([from, to]) => match.index >= from && match.index < to)) continue;
    const stated = Number(match[1].replace(/,/g, ''));
    const unit = match[2];
    const end = match.index + match[0].length;
    out.push({
      stated,
      unit,
      // The sentence's own line may wrap inside the figure (`98,927\nbytes`); a refusal quoting
      // a newline would print a table row in three pieces, so the quote is the figure's words.
      written: match[0].replace(/\s+/g, ' '),
      start: match.index,
      end,
      dated: DATED.test(text.slice(end, end + DATE_WINDOW)),
    });
  }
  return out;
}

/** The code spans of a text, which is where a path this tree holds is written. */
export function spansIn(text) {
  const out = [];
  for (const match of text.matchAll(SPAN)) {
    out.push({ path: match[1], start: match.index, end: match.index + match[0].length });
  }
  return out;
}

/**
 * The document a figure is the size of, or `null` when the sentence names none.
 *
 * The nearest code span **before** the figure, provided the two sit in one sentence and the
 * span is a path this tree holds. Both conditions are load-bearing:
 *
 * - **One sentence**, because `L3 is 284 lines` in `O-019` follows a sentence that names
 *   `docs/acceptance.md`, and pairing that figure with that file would compare the length of
 *   a section with the length of the document -- a refusal whose repair would be wrong.
 * - **A path this tree holds**, because `openrca-2.0` is a corpus name rather than a file,
 *   and a figure about it is a figure about something outside the tree.
 *
 * `measure` is the caller's: this module reads no file, so every rule in it is testable
 * against a table instead of against a checkout.
 */
export function subjectOf(text, at, measure) {
  const before = spansIn(text.slice(0, at)).reverse();
  for (const span of before) {
    const between = text.slice(span.end, at);
    if (SENTENCE_END.test(between)) return null;
    const measurement = measure(span.path);
    if (measurement === null) return null;
    return { ...measurement, path: span.path };
  }
  return null;
}

/**
 * Half a unit in the last place a figure states, in the unit below it.
 *
 * A stated size is rounded to the place it is written in, and a tolerance of anything else
 * is a number somebody chose: `161.2 KB` promises the nearest tenth of a kilobyte, so the
 * measurement it describes lies within 51 bytes of 165,069 and `165,067` is the same claim.
 * Zero decimals makes it half a unit, which is what `96 KB` promises and no more.
 */
export function toleranceOf(stated, factor) {
  const text = String(stated);
  const dot = text.indexOf('.');
  const decimals = dot === -1 ? 0 : text.length - dot - 1;
  return (factor / 2) * 10 ** -decimals;
}

/** Whether a stated figure is the measurement it stands for, within what it promises. */
export function statesSameSize(figure, actual) {
  const factor = SIZE_UNITS.get(figure.unit);
  const scale = factor ?? 1;
  const stated = factor === null ? figure.stated : figure.stated * factor;
  return Math.abs(stated - actual) <= toleranceOf(figure.stated, scale);
}

/**
 * The size of a text, as a reader of the live list would state it: bytes, and lines.
 *
 * An empty file is nought lines rather than one: `'\n'.split('\n')` is two elements and no
 * file has a line it does not have.
 */
export function measurementOf(text) {
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
  };
}

/** `165,067` -- grouped the way every figure in this corpus is written. */
export function grouped(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `161.2 KB`, from a byte count, to the tenth -- the one place the corpus writes sizes in. */
export function inKilobytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * What one live entry states that it cannot keep, in the order the entry states it.
 *
 * Two refusals, because there are two repairs and they are different acts:
 *
 * - the sentence names a file of this tree and the figure is not its size -- the figure has
 *   aged, and the refusal quotes the size the file has;
 * - the sentence names no file and carries no round -- the figure can never be checked, so
 *   what it needs is a date rather than a value.
 *
 * Both name the figure, because a message that said "an entry states a size" would send a
 * person looking for which one. `round` is the label the caller prints in front; this
 * function returns the sentences and lets the gate place them.
 */
export function sizeProblems(entry, measure) {
  const problems = [];
  for (const figure of sizesIn(entry.text)) {
    const written = `\`${figure.written}\``;
    if (figure.dated) continue;
    const subject = subjectOf(entry.text, figure.start, measure);
    if (subject === null) {
      problems.push(
        `${entry.id ?? 'an entry'} states ${written} and names neither a file this tree holds ` +
          'nor the round that measured it -- a size or a length in the live list is measured ' +
          'again by every round that writes, so a figure that does not say when is a figure ' +
          'that ages without anybody noticing (finding 620 one document over); write ' +
          `\`${figure.written} at vX.YY\`, or drop it`,
      );
      continue;
    }
    const lines = SIZE_UNITS.get(figure.unit) === null;
    const actual = lines ? subject.lines : subject.bytes;
    if (statesSameSize(figure, actual)) continue;
    problems.push(
      `${entry.id ?? 'an entry'} states ${written} for \`${subject.path}\`, and that file ` +
        `is ${grouped(actual)} ${lines ? 'lines' : 'bytes'} at this commit ` +
        `(${inKilobytes(subject.bytes)}) -- the figure is a measurement that has aged, so state ` +
        'the size this tree has, or the round that took the one you have: ' +
        `\`${figure.written} at vX.YY\``,
    );
  }
  return problems;
}
