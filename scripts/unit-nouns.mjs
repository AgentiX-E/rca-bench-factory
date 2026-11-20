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
 * and `citation(s)` by one, but **nine nouns are printed by two or more gates**, and three
 * of the four nouns the entry names are among them:
 *
 *   row(s)         4 gates   `8`, `9`, `318` and `1`, and `8` again
 *   file(s)        4 gates   `37`, `474`, `474`, `6`
 *   run(s)         4 gates   `0` three times and `6`
 *   row break(s)   3 gates   `32515`, `41683`, `824`
 *
 * Those numbers are of one run and they move; the gate prints them, and this paragraph is the
 * measurement the vocabulary was built from rather than a table anyone keeps equal.
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
 * is a reader -- one place that holds every unit noun beside the numbers each gate prints,
 * and says what the sharing means.
 *
 * ## Why the inventory is a table, the counts are not, and the relation is
 *
 * The counts move every round: a source file is added, a record is written, a table grows.
 * An inventory that stored them would be red for reasons its subject has nothing to do
 * with, and a gate that cries wolf is the defect this campaign keeps recording. So the
 * committed inventory holds **which gate prints which noun**, and the counts are printed
 * by the gate that derives it.
 *
 * The **relation** is stored, and it is not a count: two gates printing one noun are either
 * counting one population twice (`addendum(s)`, both from `populationsOf`), two disjoint
 * populations of the same kind (`volume(s)`: the audit volumes and the progress volumes), or
 * one word for unrelated objects (`row(s)`: four tables). No derivation can tell those apart,
 * so a person writes a sentence per shared noun and the gate refuses to run without one. The
 * counts of a coincidence are derived, not stored: which counts happen to be equal is this
 * week's, and which two gates share a word is the tree's.
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
 * The `check-unit-nouns` summary counts unit nouns, gate/noun pairs and shared nouns, so it
 * speaks this vocabulary too -- and those numbers are not stated here, because a copy of a count
 * in a comment is a second number to keep equal (finding 609's neighbourhood). It cannot be
 * in its own census -- the counts would depend on the census that is counting them -- and the
 * exclusion is by name rather than by silence, so a second gate that measures the census is
 * still counted.
 */

/**
 * The census is of a **run**, and a noun a gate prints only in some runs is a real event.
 *
 * `check-ci-budget` prints `budget(s) widened since the reading` only when a ceiling moved, so the
 * vocabulary of a run depends on the tree the run is against -- and the inventory therefore records
 * `budget(s)` only while a ceiling is being widened. That is not drift to be smoothed over: a noun
 * entering the log is exactly the moment a reader has to be told what it counts, and the diff this
 * produces is one line. The alternative -- reading the nouns out of the gates' source instead of
 * their output -- would make the census a statement about what a gate *could* print, which is the
 * value-narrower-than-its-name failure this campaign keeps finding.
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
 *
 * The qualifier is captured rather than skipped, and there can be more than one, because the
 * qualifiers between a number and its noun are exactly the words that say **which population**
 * the number counts -- `219 `vX.YY` round(s)` beside `50 `Pass` round(s)` in one summary. A
 * reader that reached past them reported the number and dropped the only word distinguishing
 * it from the one next to it, which is finding 600 committed by the reader that finding 607
 * added (finding 610).
 */
const BEFORE = /(\d[\d,]*)((?:\s*(?:\([^)]*\)|`[^`]*`|'[^']*'))*)\s*$/;

/**
 * Every unit-noun use in one line, with the count in front of it and what qualifies it.
 *
 * `count` is `null` when no number precedes the noun. That is not a count of zero: it is a
 * noun whose number is somewhere a reader can see and this reader cannot, and a census that
 * flattened the two would be reporting a number it had not read. Those uses are counted by
 * `unreadableOf` rather than dropped, because a census that silently skips what it cannot read
 * is a census of less than it claims (finding 611).
 *
 * `qualifier` is the text between the number and the noun -- `` `vX.YY` ``, `(38+56)`, `'#'` --
 * or `null` when the number is adjacent. It travels with the count so a summary can print the
 * number as the gate wrote it.
 */
export function nounsIn(line) {
  const out = [];
  for (const match of line.matchAll(UNIT_NOUN)) {
    const before = BEFORE.exec(line.slice(0, match.index));
    const qualifier = before === null || before[2] === '' ? null : before[2].trim();
    out.push({
      noun: `${nounAt(match[1].split(/\s+/))}(${match[2]})`,
      count: before === null ? null : Number(before[1].replace(/,/g, '')),
      qualifier,
    });
  }
  return out;
}

/**
 * The census: noun -> gate -> the uses that gate printed under it.
 *
 * A gate can print one noun more than once -- `check-open-list` counts `318 row(s)` in the
 * record tables and `1 row(s)` judged in the newest -- so the leaf is a list. Collapsing it
 * to one number would answer "what does this gate mean by `row(s)`" with whichever use was
 * last, which is the arbitrary answer the census exists to replace.
 *
 * The leaf holds the use rather than the number, because a use that states no number is a
 * population the census has seen and cannot size, and dropping it made `round(s)` a noun two
 * gates print with nothing to show for it (finding 610).
 */
export function censusOf(readings) {
  const census = new Map();
  for (const { gate, text } of readings) {
    for (const line of String(text).split('\n')) {
      for (const use of nounsIn(line)) {
        if (!census.has(use.noun)) census.set(use.noun, new Map());
        const perGate = census.get(use.noun);
        if (!perGate.has(gate)) perGate.set(gate, []);
        perGate.get(gate).push({ count: use.count, qualifier: use.qualifier });
      }
    }
  }
  return census;
}

/**
 * The numbers one gate prints under one noun, deduplicated and in the order it printed them.
 *
 * Order of appearance rather than ascending, because the order is the gate's: `219 `vX.YY`, 50
 * `Pass`` is how `check-progress-volumes` writes its own sentence, and a reader comparing the
 * census with that summary should not have to reorder it.
 */
export function numbersOf(uses) {
  return [...new Set(uses.filter((use) => use.count !== null).map((use) => use.count))];
}

/** The nouns more than one gate prints, in the order a reader would want: most gates first. */
export function sharedNounsOf(census) {
  return [...census.entries()]
    .filter(([, perGate]) => perGate.size > 1)
    .map(([noun, perGate]) => ({ noun, gates: [...perGate.keys()].sort() }))
    .sort((a, b) => b.gates.length - a.gates.length || a.noun.localeCompare(b.noun));
}

/**
 * The noun uses whose number this reader cannot see, with the gates that print them.
 *
 * `scope(s) covered: core, cli, repo` states no count at all and `8 inline z.enum call(s)`
 * states one with three words in between; both are read as a use with no number. They are
 * reported rather than dropped: the census's headline is a count of what it read, and a reader
 * cannot tell a log in which everything was sized from one in which half the nouns were passed
 * over in silence (finding 611).
 */
export function unreadableOf(census) {
  const out = [];
  for (const [noun, perGate] of census) {
    const gates = [...perGate.entries()]
      .filter(([, uses]) => uses.some((use) => use.count === null))
      .map(([gate]) => gate)
      .sort();
    if (gates.length > 0) out.push({ noun, gates });
  }
  return out.sort((a, b) => a.noun.localeCompare(b.noun));
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
    for (const [gate, uses] of perGate) {
      for (const count of numbersOf(uses)) {
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
 * The committed inventory: the vocabulary and which nouns are shared, and no counts.
 *
 * Sorted and plain so that a diff is a sentence a reviewer can read rather than a
 * reordering of keys. The **relation** -- whether two gates printing one noun are counting one
 * population -- is a judgement and lives here too, written by a person and preserved by `--write`.
 */
export function inventoryOf(census) {
  return {
    nouns: [...census.entries()]
      .map(([noun, perGate]) => ({ noun, gates: [...perGate.keys()].sort() }))
      .sort((a, b) => a.noun.localeCompare(b.noun)),
    shared: sharedNounsOf(census).map(({ noun, gates }) => ({ noun, gates })),
  };
}

/**
 * What identifies a shared noun for the purpose of the judgement.
 *
 * The *gates and the noun*, never the count: `474 file(s)` is the same judgement as `473 file(s)`
 * tomorrow, because both say `check-comments-language` and `check-doc-counts` print one number for
 * two populations and the disagreement is about what each means. Keying the judgement by the number
 * would make every added source file a red gate whose repair is to retype a sentence that had not
 * stopped being true -- the crying-wolf failure this campaign has recorded more than once.
 */
export function keyOf(shared) {
  return `${shared.noun}::${shared.gates.join('+')}`;
}

/**
 * One line per shared noun: every gate's numbers, the qualifiers they carried, and the relation
 * the inventory records.
 *
 * This is the sentence the census was missing (finding 609). Its old summary said `volume(s) by 2`
 * -- the gates' *names*, never their numbers -- so a reader of this gate alone could not see that
 * one gate prints **14** volumes and the other **18**, let alone whether they are the same
 * fourteen. The two numbers were each printed by their own gate, forty lines apart in one log,
 * which is finding 600 one gate out: the reader that exists to hold two populations of one word
 * together held the names and dropped the numbers.
 *
 * `relations` is the judgement this function cannot derive. Two gates printing one noun may be
 * counting one population twice (`addendum(s)`, both from `populationsOf`), two disjoint
 * populations of the same kind (`volume(s)`: `docs/audit` and `docs/progress`), or one word for
 * unrelated objects (`row(s)`: four tables). The output alone cannot tell those apart, so a person
 * says which and this prints what they said. A count that two gates print is marked, because that
 * is the one case where the numbers agree and the populations still may not.
 */
/**
 * What a shared noun's line ends with when the inventory holds no relation for it.
 *
 * Exported so the gate can recognise the sentence it is refusing without repeating the word: a
 * second copy of a literal is a pair that can drift, and this one decides whether a noun is
 * refused or printed.
 */
export const UNSTATED = 'unclassified';

export function relationsOf(census, relations = new Map()) {
  const coincident = new Set(coincidencesOf(census).map((one) => `${one.noun}::${String(one.count)}`));
  return sharedNounsOf(census).map(({ noun, gates }) => {
    const perGate = census.get(noun);
    const counted = gates.map((gate) => {
      const uses = perGate.get(gate);
      const numbers = numbersOf(uses);
      if (numbers.length === 0) return `no number in ${gate}`;
      // The qualifier travels with its number, because the qualifier is what says which
      // population the number counts: `219 `vX.YY` round(s)` and `50 `Pass` round(s)` are two
      // lines of one summary and a reader given `219, 50` has been handed finding 600's pair.
      const said = numbers.map((count) => {
        const use = uses.find((one) => one.count === count);
        return use.qualifier === null ? String(count) : `${String(count)} ${use.qualifier}`;
      });
      return `${said.join(', ')} in ${gate}`;
    });
    const agreeing = gates.some((gate) => numbersOf(perGate.get(gate)).some((count) => coincident.has(`${noun}::${String(count)}`)));
    const relation = relations.get(keyOf({ noun, gates }));
    return (
      `${noun} — ${counted.join('; ')}` +
      (agreeing ? ' (a count two gates print agrees)' : '') +
      ` — ${relation === undefined ? UNSTATED : relation}`
    );
  });
}

/** The census as one sentence, with the numbers that need explaining explained by the lines below.
 *
 * `relations` is the judgement the inventory carries and this function cannot derive, and the
 * summary says how many shared nouns have one rather than reciting them: the sentences are printed
 * by `relationsOf`, one per line, because nine of them inside one sentence is not a sentence.
 */
export function summaryOf(census, relations = new Map()) {
  const uses = [...census.values()].reduce((all, perGate) => all + perGate.size, 0);
  const shared = sharedNounsOf(census);
  const coincidences = coincidencesOf(census);
  const unreadable = unreadableOf(census);
  const parts = [];
  const stated = shared.filter((one) => relations.has(keyOf(one)));
  parts.push(
    `${String(census.size)} unit noun(s) in ${String(uses)} gate/noun pair(s); ` +
      (shared.length === 0
        ? 'none of them is printed by more than one gate'
        : `${String(shared.length)} of them are printed by more than one gate, and ` +
          `${String(stated.length)} of those say what the other one counts`),
  );
  parts.push(
    coincidences.length === 0
      ? 'no count of 1 or more is printed by two gates under one noun'
      : `${String(coincidences.length)} count(s) coincide across gates: ` +
        coincidences
          .map((one) => `${String(one.count)} ${one.noun} in ${one.gates.join(' and ')}`)
          .join('; '),
  );
  parts.push(
    unreadable.length === 0
      ? 'and every use states its number'
      : `and ${String(unreadable.length)} noun(s) are printed somewhere with no number this reader can read: ` +
        unreadable.map((one) => `${one.noun} in ${one.gates.join(' and ')}`).join('; '),
  );
  return parts.join('; ');
}

