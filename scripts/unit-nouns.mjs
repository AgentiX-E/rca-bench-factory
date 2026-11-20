#!/usr/bin/env node
/**
 * The units the gates count in, and which of them more than one gate counts.
 *
 * ## The question this module exists to answer
 *
 * `O-091` says, in as many words, that "the other nine guards print counts under nouns
 * no other guard shares -- `finding(s)` in `check-audit-volumes`, `citation(s)` in
 * `check-citations`, `entry(ies)` in `check-open-list`'s two lists, `row(s)` in its table
 * census -- and no reader asks what population each noun covers."
 *
 * Measured, the first half of that sentence is false. `finding(s)` is printed by one gate,
 * and `citation(s)` by one, but **eight nouns are printed by two or more gates**, and three
 * of the four nouns the entry names are among them:
 *
 *   row(s)         4 gates   `9`, `318` and `1`, and `8` twice
 *   file(s)        4 gates   `471`, `66`, `37`, `6`
 *   run(s)         3 gates   `0` three times
 *   row break(s)   3 gates   `41508`, `32311`, `817`
 *
 * The second half is true, and it is the part that matters: no reader asked. That is why
 * the two gates in the `row(s)` row above both print **8** -- `check-fault-cases` counting
 * the rows of a case's pre-injection window and `check-repository-table` counting the rows
 * under `## Repository` -- and why nothing in the tree noticed.
 *
 * This is finding 600's shape one level up. There, two gates printed *different* numbers
 * for one word and a reader had to reconcile them; here four gates print *one* word for
 * four populations and nothing says whether they overlap. Finding 602 named the general
 * form: **a comparison present in the output is not a comparison anyone made.** The repair
 * is a reader -- one place that holds every unit noun beside the gates that use it, and
 * prints the coincidences.
 *
 * ## Why the inventory is a table and the counts are not
 *
 * The counts move every round: a source file is added, a record is written, a table grows.
 * An inventory that stored them would be red for reasons its subject has nothing to do
 * with, and a gate that cries wolf is the defect this campaign keeps recording. So the
 * committed inventory holds **which gate prints which noun**, and the counts are printed
 * by the gate that derives it. A coincidence *is* stored, as `(noun, gates)` rather than
 * `(noun, count, gates)`, for the same reason: which two gates print the same number for
 * different things is a fact about the tree, and the number itself is a fact about this
 * week.
 *
 * ## Why zero is not a coincidence
 *
 * `0 run(s) of Han prose` appears in three language gates, and naming it would be noise:
 * a zero is an absence, every gate that found nothing prints one, and a census that
 * reported those would bury the two-eights that a reader actually needs to see. A count of
 * at least 1 printed by two gates is a claim that two numbers are equal; zero printed by
 * three gates is a claim that three gates are quiet.
 *
 * ## Why a gate's own line is excluded
 *
 * The `check-unit-nouns` summary carries `21 gate(s)`, `46 count(s)` and `21 noun(s)`, so
 * it speaks this vocabulary too. It cannot be in its own census -- the counts would depend
 * on the census that is counting them -- and the exclusion is by name rather than by
 * silence, so a second gate that measures the census is still counted.
 */

/**
 * The unit-noun marker: a word, an optional second word, and the `(s)` / `(ies)` suffix.
 *
 * `row break(s)` and `gate-site claim(s)` are units in their own right -- the two-word form
 * is the noun, not an adjective beside it -- while `9 row(s)` is one word, because the
 * pattern starts at a letter and cannot reach back across the number.
 */
export const UNIT_NOUN = /([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*)?)\((s|ies)\)/g;

/**
 * The words that cannot begin a unit noun, so `the record(s)` is read as `record(s)`.
 *
 * The second word of a two-word unit in this corpus is always the noun -- `break`, `count`, `claim`,
 * `table`, `window`, `assertion`, `block`, `opener`, `string`, `parameter`, `run`, `row`, `entr` --
 * and the first is a qualifier saying *which* one (`row`, `gate-site`, `published`, `earlier`,
 * `open`). A function word can only ever belong to the sentence, so reading `the record(s)` as a
 * noun called `the record(s)` would enter one population twice under two names: the defect the
 * census exists to find, committed by the census.
 *
 * The list is closed and short on purpose. It is the set of words whose presence in front of a noun
 * marker makes the phrase a sentence fragment, and every member was read out of a summary this tree
 * prints -- not out of a grammar.
 */
const FUNCTION_WORDS = new Set([
  'a', 'all', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'both', 'but', 'by', 'each', 'every',
  'for', 'from', 'has', 'if', 'in', 'into', 'is', 'it', 'its', 'no', 'not', 'of', 'on', 'only',
  'or', 'over', 'per', 'so', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'to', 'under', 'was', 'were', 'when', 'where', 'which', 'while', 'with',
  'whose', 'yet',
]);

/**
 * The noun a marker belongs to: the last word before `(s)`, and the one before it only when that
 * word can qualify a noun.
 */
function nounAt(words) {
  const last = words[words.length - 1];
  const first = words.length > 1 ? words[0] : null;
  if (first === null || FUNCTION_WORDS.has(first.toLowerCase())) return last;
  return `${first} ${last}`;
}

/**
 * The number a noun is counting, which is not always adjacent to it.
 *
 * `94 (38+56) character(s)` states the total and then its partition, and the total is the
 * count. Reading the parenthetical as the number would report 38 -- the narrower of two
 * values under the wider name, which is finding 595.
 */
const BEFORE = /(\d[\d,]*)\s*(?:\([^)]*\)\s*)?$/;

/**
 * Every unit-noun use in one line, with the count in front of it.
 *
 * `count` is `null` when no number precedes the noun. That is not a count of zero: it is a
 * noun whose number is somewhere a reader can see and this reader cannot, and a census that
 * flattened the two would be reporting a number it had not read.
 */
export function nounsIn(line) {
  const out = [];
  for (const match of line.matchAll(UNIT_NOUN)) {
    const before = BEFORE.exec(line.slice(0, match.index));
    out.push({
      noun: `${nounAt(match[1].split(/\s+/))}(${match[2]})`,
      count: before === null ? null : Number(before[1].replace(/,/g, '')),
    });
  }
  return out;
}

/**
 * The census: noun -> gate -> the counts that gate printed under it.
 *
 * A gate can print one noun more than once -- `check-open-list` counts `318 row(s)` in the
 * record tables and `1 row(s)` judged in the newest -- so the leaf is a list. Collapsing it
 * to one number would answer "what does this gate mean by `row(s)`" with whichever use was
 * last, which is the arbitrary answer the census exists to replace.
 */
export function censusOf(readings) {
  const census = new Map();
  for (const { gate, text } of readings) {
    for (const line of String(text).split('\n')) {
      for (const { noun, count } of nounsIn(line)) {
        if (!census.has(noun)) census.set(noun, new Map());
        const perGate = census.get(noun);
        if (!perGate.has(gate)) perGate.set(gate, []);
        const counts = perGate.get(gate);
        if (count !== null) counts.push(count);
      }
    }
  }
  return census;
}

/** The nouns more than one gate prints, in the order a reader would want: most gates first. */
export function sharedNounsOf(census) {
  return [...census.entries()]
    .filter(([, perGate]) => perGate.size > 1)
    .map(([noun, perGate]) => ({ noun, gates: [...perGate.keys()].sort() }))
    .sort((a, b) => b.gates.length - a.gates.length || a.noun.localeCompare(b.noun));
}

/**
 * Every count of at least 1 that two different gates print under one noun.
 *
 * Two different gates, because the same gate printing `8 row(s)` twice is a sentence with
 * two clauses rather than two populations; and at least 1, for the reason in the header.
 */
export function coincidencesOf(census) {
  const out = [];
  for (const [noun, perGate] of census) {
    const byCount = new Map();
    for (const [gate, counts] of perGate) {
      for (const count of new Set(counts)) {
        if (count < 1) continue;
        if (!byCount.has(count)) byCount.set(count, new Set());
        byCount.get(count).add(gate);
      }
    }
    for (const [count, gates] of byCount) {
      if (gates.size < 2) continue;
      out.push({ noun, count, gates: [...gates].sort() });
    }
  }
  return out.sort((a, b) => a.noun.localeCompare(b.noun) || a.count - b.count);
}

/**
 * The committed inventory: the vocabulary and the coincidences, and no counts.
 *
 * Sorted and plain so that a diff is a sentence a reviewer can read rather than a
 * reordering of keys.
 */
export function inventoryOf(census) {
  return {
    nouns: [...census.entries()]
      .map(([noun, perGate]) => ({ noun, gates: [...perGate.keys()].sort() }))
      .sort((a, b) => a.noun.localeCompare(b.noun)),
    shared: sharedNounsOf(census).map(({ noun, gates }) => ({ noun, gates })),
    // No count, for the reason the header gives: the number a coincidence happens to be is this
    // week's, and which two gates print one is the tree's.
    coincidences: coincidencesOf(census).map(({ noun, gates }) => ({ noun, gates })),
  };
}

/**
 * What identifies a coincidence for the purpose of the judgement.
 *
 * The *gates and the noun*, never the count: `474 file(s)` is the same coincidence as `473 file(s)`
 * tomorrow, because both say `check-comments-language` and `check-doc-counts` print one number for
 * two populations and the disagreement is about what each means. Keying the judgement by the number
 * would make every added source file a red gate whose repair is to retype a sentence that had not
 * stopped being true -- the crying-wolf failure this campaign has recorded more than once.
 */
export function keyOf(coincidence) {
  return `${coincidence.noun}::${coincidence.gates.join('+')}`;
}

/** The census as one sentence, with the coincidences spelled out rather than counted.
 *
 * `readings` is the judgement the inventory carries and this function cannot derive: a
 * coincidence is either **one population read twice** -- `1 addendum(s)` in `check-open-list`
 * and `check-progress-volumes`, both from `populationsOf` -- or **two populations under one
 * noun**, which is `8 row(s)` in `check-fault-cases` and `check-repository-table`. The output
 * alone cannot tell the two apart, so a person has to say which, and the summary says what
 * they said. A sentence that called every coincidence an ambiguity would be the constant
 * this campaign keeps finding: right about one case, wrong about the other.
 */
export function summaryOf(census, readings = new Map()) {
  const uses = [...census.values()].reduce((all, perGate) => all + perGate.size, 0);
  const shared = sharedNounsOf(census);
  const coincidences = coincidencesOf(census);
  const parts = [];
  parts.push(
    `${String(census.size)} unit noun(s) in ${String(uses)} gate/noun pair(s); ` +
      (shared.length === 0
        ? 'none of them is printed by more than one gate'
        : `${String(shared.length)} of them are printed by more than one gate: ` +
          shared.map((one) => `${one.noun} by ${String(one.gates.length)}`).join(', ')),
  );
  parts.push(
    coincidences.length === 0
      ? 'no count of 1 or more is printed by two gates under one noun'
      : `and ${String(coincidences.length)} count(s) coincide across gates: ` +
        coincidences
          .map((one) => {
            const reading = readings.get(keyOf(one));
            return (
              `${String(one.count)} ${one.noun} in ${one.gates.join(' and ')} ` +
              `(${reading === undefined ? 'unclassified' : reading})`
            );
          })
          .join('; '),
  );
  return parts.join('; ');
}
