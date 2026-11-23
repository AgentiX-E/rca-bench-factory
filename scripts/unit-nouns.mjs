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
 * counting one population twice (`addendum(s)`), two disjoint populations of the same kind
 * (`volume(s)`: the audit volumes and the progress volumes), or one word for unrelated objects
 * (`row(s)`: four tables). No derivation can tell those apart, so a person writes a sentence per
 * shared noun and the gate refuses to run without one. The counts of a coincidence are derived, not
 * stored: which counts happen to be equal is this week's, and which two gates share a word is the
 * tree's.
 *
 * ## Why the sentence is not the whole judgement (finding 616)
 *
 * A sentence is not something a run can hold. `addendum(s)` said "both take it from
 * `populationsOf` in `progress-volumes.mjs`, so the number is shared rather than merely equal", and
 * `check-open-list` imports `docs-corpus.mjs` and nothing else: two readers over one set of headings.
 * The conclusion was right, the reason was wrong, and the census could not tell which was which --
 * so the part that *is* checkable is stored separately now. A noun's gates are partitioned into
 * **populations**, a group of two is the claim that those two gates read one set, and the census
 * checks that their numbers agree. What is left in the sentence is what no run can decide: why the
 * two read one set, and what the sets that are not shared are.
 *
 * `file(s)` is why the partition is per noun rather than a property of the noun: two of its four
 * gates walk the source walk and the other two walk the documentation and the workflows, and one
 * sentence has no way to say that. Three of the nine shared nouns carry such a group this round, so
 * three of the equalities the census prints are checked instead of assumed.
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

/**
 * The figures a sentence states, in the order it states them -- and none for a name.
 *
 * A relation is prose and prose may carry a number: four of the nine carry one this round (two
 * volumes, three files, one eight, one zero). What a sentence may **not** carry is a figure no gate
 * printed, because a figure no gate printed is a copy of nothing: `4.7 per cent` in `comment(s)` was
 * a ratio of two counts taken in some earlier round, and this round's two counts make 4.84 -- a
 * number that moved and took nothing with it (finding 620).
 *
 * A numeral **glued** to a letter, a hyphen, a dot or an underscore is part of a name rather than a
 * count, and the corpus writes three of those: `check-l4-status` (a gate's name), `L4` (what that
 * gate's registry is called), and `v3.129` (a version). Telling them apart by a list of exemptions
 * would be a list to keep equal to the corpus; the glue is a property of the token, and it is what
 * makes `14` a count and `L4` a name without anybody deciding which names exist.
 */
export function figuresOf(relation) {
  if (typeof relation !== 'string') return [];
  return [...relation.matchAll(/(?<![A-Za-z0-9_.-])\d[\d,]*(?:\.\d+)?/g)].map((one) =>
    Number(one[0].replace(/,/g, '')),
  );
}

/**
 * The relations stating a figure no gate printed under their noun, with the counts the noun does
 * state.
 *
 * Finding 600's shape one document over. There, two gates printed different numbers for one fact and
 * a reader had to reconcile them; here a sentence and the gates print different numbers for one fact
 * and nothing read either. The counts are kept out of the inventory on the argument that they move
 * every round -- and a sentence that states one is a count in the inventory with none of that
 * argument's protection, because nothing compares it with anything.
 *
 * A judgement whose noun no gate printed this run is skipped rather than refused: `budget(s)` is
 * silent in most rounds, and the round that brings a noun back is the round that can ask.
 */
export function unprintedFiguresOf(census, judgements = new Map()) {
  const out = [];
  for (const judgement of judgements.values()) {
    const perGate = census.get(judgement.noun);
    if (perGate === undefined) continue;
    const counts = [
      ...new Set([...perGate.keys()].sort().flatMap((gate) => numbersOf(perGate.get(gate)))),
    ];
    const missing = figuresOf(judgement.relation).filter((figure) => !counts.includes(figure));
    if (missing.length > 0) out.push({ noun: judgement.noun, stated: missing, counts });
    // The separate sentences are held to a narrower set, because the number beside each of them is
    // one gate's number: a distance may repeat its own count and must not borrow another gate's. The
    // union would have let `check-ci-budget`'s sentence state the `50` that
    // `check-progress-volumes` prints -- finding 620 with one more hop between the figure and the
    // reader who could have caught it.
    for (const one of separateOf(judgement)) {
      if (one.gate === null || one.counts === null) continue;
      const own = [...new Set(numbersOf(perGate.get(one.gate) ?? []))];
      const absent = figuresOf(one.counts).filter((figure) => !own.includes(figure));
      if (absent.length > 0) out.push({ noun: judgement.noun, gate: one.gate, stated: absent, counts: own });
    }
  }
  return out.sort(
    (a, b) =>
      a.noun.localeCompare(b.noun) ||
      String(a.gate ?? '').localeCompare(String(b.gate ?? '')),
  );
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
 * The committed inventory: the vocabulary and which nouns are shared, and no counts.
 *
 * Sorted and plain so that a diff is a sentence a reviewer can read rather than a reordering of
 * keys. The **judgement** -- whether two gates printing one noun are counting one population, and
 * which of them are -- lives here too, written by a person and preserved by `--write`.
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
 * What identifies a judgement: the noun, and nothing else (`O-099`).
 *
 * The key used to be the noun **and its gates**, on the argument that a partition drawn around four
 * gates says nothing about a fifth. The argument is right and the key was the wrong instrument: it
 * threw the sentence away along with the partition. `check-ci-budget` prints `N round(s)` while the
 * ledger is behind and stops when it catches up, so `round(s)`'s gate set moves twice inside one
 * round -- and the sentence "one gate prints the rounds it advances and one prints the rounds it
 * counted" was retyped three times in a single round for no reason but the key.
 *
 * The noun is the unit a person writes about, so the noun is the key. A gate joining the noun does
 * not discard the judgement: its partition no longer covers the new gate, `partitionProblems` names
 * it, and the refusal is one line -- "place this gate in a population" -- while the sentence that
 * was not wrong stays exactly where it was written. That is the same trade the coverage row makes:
 * a red gate whose repair is to write the thing nobody has said, never to retype the thing somebody
 * already said.
 *
 * What the key still refuses is a judgement carrying over between **nouns**: `row(s)` and `file(s)`
 * are different populations with different relations, and one noun's sentence is not the other's.
 */
export function keyOf(shared) {
  return shared.noun;
}

/**
 * The record for a noun, looked up through `keyOf` rather than around it.
 *
 * Writers key their entries with `keyOf` and readers find them with it, so the two cannot drift.
 * `O-099` survived a round because every reader held its own idea of the key -- and six of them read
 * the gates out of the record instead of out of the tree, which is the same mistake one level down.
 */
function judgementFor(judgements, noun) {
  return judgements.get(keyOf({ noun }));
}

/**
 * What a shared noun's line ends with when the inventory holds no relation for it.
 *
 * A noun in that state is still printed, so a reader sees the numbers beside the word `unclassified`
 * rather than a line with a judgement-shaped hole in it. The gate no longer recognises the state by
 * this text (`unstatedOf` answers it), which is why the constant is only a word now.
 */
export const UNSTATED = 'unclassified';

/** The gates the census knows a noun is printed by, sorted -- what a partition has to cover this run. */
function gatesOf(census, noun) {
  return [...(census.get(noun)?.keys() ?? [])].sort();
}

/**
 * One noun's judgement as this run reads it: its gates, the record, and whether the record covers them.
 *
 * The three questions belong together and were being asked separately in six functions, each with
 * its own idea of which gates to compare against -- which is how `O-099` stayed invisible: every
 * caller read the gates out of the record, so a gate joining a noun looked like nothing at all.
 * `declared` is the one sentence the readers want: the record exists *and* its partition covers the
 * gates this run found.
 */
export function stateOf(census, judgements, noun) {
  const gates = gatesOf(census, noun);
  const judgement = judgementFor(judgements, noun) ?? null;
  const problems = judgement === null ? ['no entry for this noun'] : partitionProblems(judgement, gates);
  return { noun, gates, judgement, problems, declared: judgement !== null && problems.length === 0 };
}

/**
 * The populations a judgement declares: a list of gate groups, each sorted -- or `null`.
 *
 * The partition is the part of the judgement a run can hold. Nine nouns are printed by more than one
 * gate, each carries a sentence a person wrote, and a sentence that has stopped being true stays
 * printed (`O-097`). A group of two gates is the one claim inside such a sentence that a run can
 * check, because it has a consequence in numbers: those two gates read one set, so their counts must
 * agree. `file(s)` is why the unit is the group rather than the noun -- two of its four gates walk
 * the source walk and two do not, and one flag per noun cannot say that (finding 616).
 *
 * Sorting is inside the function rather than left to the writer: a partition that means the same
 * thing written in a different order is not a change, and `--write` round-trips the document.
 */
export function partitionOf(judgement) {
  const populations = judgement?.populations;
  if (!Array.isArray(populations)) return null;
  return populations
    .map((group) => (Array.isArray(group) ? [...group].sort() : []))
    .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));
}

/**
 * The gates a judgement declares print the noun and do not count its members -- or `[]`.
 *
 * The third placement, and the one `O-104` measured the need for. A partition has one word for a
 * group of gates, and the corpus had a number that is not a count of the noun at all:
 * `check-ci-budget` prints `0 round(s)`, meaning **how far** the ledger's newest row sits from the
 * newest round. Written as `[["check-ci-budget"]]` it was a population of one -- the same shape as
 * `check-workflow-language`'s six workflows, which is a corpus -- so the record said a distance was a
 * count of rounds. The noun's population is rounds; the distance between two of them is not a member
 * of it, and the schema had no way to say so.
 *
 * A declaration is a gate and a sentence, because the two questions are one: *which* number is not a
 * count, and *what* it measures instead. The sentence is held to the same rule the noun's relation
 * is -- a figure it states must be one **that gate** printed -- and it is checked against that gate's
 * counts alone rather than against every count under the noun, because the number beside it is that
 * gate's number. The relation is about the population and would have to say two things at once.
 *
 * Sorted by gate, and `null` for a sentence nobody wrote, so a refusal can name the one thing missing
 * rather than a shape. An entry whose gate is not a name is kept with `gate: null` for the same
 * reason: the refusal is about a declaration that says nothing, not about a reader that crashed.
 */
export function separateOf(judgement) {
  const separate = judgement?.separate;
  if (!Array.isArray(separate)) return [];
  return separate
    .map((one) => ({
      gate:
        typeof one === 'string' && one !== ''
          ? one
          : typeof one?.gate === 'string' && one.gate !== ''
            ? one.gate
            : null,
      counts: typeof one?.counts === 'string' && one.counts.trim() !== '' ? one.counts : null,
    }))
    .sort((a, b) => (a.gate ?? '').localeCompare(b.gate ?? ''));
}

/**
 * What is wrong with a judgement's partition, as a list a reader can act on -- empty when nothing is.
 *
 * A partition is a claim that the noun's gates are covered exactly once, by one of the two placements
 * that exist. Each way of failing that is a different repair: a gate nobody placed and nobody declared
 * separate, a gate placed twice (its count is claimed by two sets at once), a gate that does not print
 * the noun at all (the record has drifted from the gates), an empty group (a population of nothing,
 * which reads as a decision that was started and not finished), and, for `separate`, a declaration
 * with no gate, with no sentence, or for a gate that is also in a population. The last four are what
 * `O-104` added: a number that is not a count of its noun used to have only the population of one to
 * be written as, which is a sentence the record could not tell from a corpus.
 *
 * `gates` is the set the **census** says print the noun, and it is a parameter rather than a field of
 * the judgement because the two are not the same fact. A gate can join a noun between two rounds
 * (`O-099`), and the question this function answers is asked about the run in hand: the new gate is
 * unplaced *now*, even though the record was complete when it was written. Reading the gates out of
 * the record instead was the defect the old key hid -- the record agreed with itself and disagreed
 * with the tree.
 *
 * The list rather than the first problem, because a record edited in one place usually needs the
 * same edit in another, and a refusal that names one at a time is a refusal per run.
 */
export function partitionProblems(judgement, gates) {
  const raw = judgement?.populations;
  const rawSeparate = judgement?.separate;
  // Neither field present is the unfilled record. `populations: []` is a filled one that says no two
  // of these gates read one set, and it is accepted because every gate can then be declared separate
  // -- the state a noun of unrelated corpora would be in.
  if (!Array.isArray(raw) && !Array.isArray(rawSeparate)) {
    return ['nothing says which of its gates read one population'];
  }
  // A flat list of names is the shape this field very nearly took in its first draft, and it reads
  // as one population of two. It is refused once, by name, rather than coerced or reported per
  // gate: a person who wrote `["a", "b"]` meant one of two things, and the rest of the problems are
  // consequences of the first.
  if (Array.isArray(raw)) {
    const flat = raw.find((group) => !Array.isArray(group));
    if (flat !== undefined) return [`a population written as ${JSON.stringify(flat)} rather than as a list of gates`];
  }
  const groups = partitionOf(judgement) ?? [];
  const separate = separateOf(judgement);
  const problems = [];
  const placed = new Set();
  for (const group of groups) {
    if (group.length === 0) {
      problems.push('a population with no gate in it');
      continue;
    }
    for (const gate of group) {
      if (!gates.includes(gate)) problems.push(`${gate} is in a population and does not print this noun`);
      if (placed.has(gate)) problems.push(`${gate} is in two populations, so its count is claimed twice`);
      placed.add(gate);
    }
  }
  // The declarations are read before the coverage line, because a gate that is declared separate is
  // placed: the coverage question is whether every gate the census found is accounted for, and
  // `separate` is one of the two ways of accounting for one.
  const declared = new Set(separate.map((one) => one.gate).filter((gate) => gate !== null));
  for (const gate of gates) {
    if (!placed.has(gate) && !declared.has(gate)) problems.push(`${gate} is in no population and not declared separate`);
  }
  // A gate declared twice is refused once, before the per-entry checks: the second entry's sentence
  // is not the repair, and printing "no sentence" beside it would send the author to write a
  // sentence the document already holds.
  const repeats = new Map();
  for (const one of separate) {
    if (one.gate !== null) repeats.set(one.gate, (repeats.get(one.gate) ?? 0) + 1);
  }
  for (const [gate, times] of repeats) {
    if (times > 1) problems.push(`${gate} is declared separate twice`);
  }
  for (const one of separate) {
    if (one.gate === null) {
      problems.push('a declaration with no gate in it');
      continue;
    }
    if ((repeats.get(one.gate) ?? 0) > 1) continue;
    if (!gates.includes(one.gate)) problems.push(`${one.gate} is declared separate and does not print this noun`);
    else if (placed.has(one.gate)) {
      problems.push(`${one.gate} is in a population and declared separate, so its count is claimed twice`);
    }
    if (one.counts === null) {
      problems.push(`${one.gate} is declared separate and no sentence says what it measures`);
    }
  }
  return problems;
}

/**
 * The counts a group of gates prints in common, and what each of them printed.
 *
 * Intersection rather than equality, because a gate can print more than one population under one
 * noun: `check-progress-volumes` writes `221 `vX.YY` round(s), 50 `Pass` round(s)`, and a group of
 * two that agrees at 221 has agreed -- calling that a disagreement would refuse the one line in the
 * corpus whose extra number is the point of finding 610's repair.
 *
 * A gate that states no number it can read makes the intersection empty *and* is named, because an
 * empty intersection and an unreadable gate are two different facts: the first is a divergence, the
 * second is a reader that could not see (finding 611).
 */
export function agreementOf(census, noun, gates) {
  const perGate = census.get(noun) ?? new Map();
  const counts = gates.map((gate) => ({ gate, numbers: numbersOf(perGate.get(gate) ?? []) }));
  const unread = counts.filter((one) => one.numbers.length === 0).map((one) => one.gate);
  const common =
    counts.length === 0 || unread.length > 0
      ? []
      : counts[0].numbers.filter((count) => counts.every((one) => one.numbers.includes(count)));
  return { common, counts, unread };
}

/**
 * Every count of at least 1 that two different gates print under one noun, and whether a population
 * holds them together.
 *
 * Two different gates, because the same gate printing `8 row(s)` twice is a sentence with
 * two clauses rather than two populations; and at least 1, for the reason in the header.
 *
 * A coincidence is classified by what the record has already said about the gates that print it,
 * because the three answers are three different facts and the line used to print two of them as one
 * (`O-106`):
 *
 *   - `together` -- one declared population holds every gate that prints the count, so the equality
 *     is a rule, and `disagreementsOf` refuses the day it stops holding;
 *   - `apart` -- every gate is placed and no population holds them all, so the record says these
 *     gates read different sets; the equal number is a **size**, and nothing is broken when it moves;
 *   - `unplaced` -- at least one gate nobody has placed, so the equality is the only evidence there
 *     is that the two might be one set, and it is the only class a person still owes an answer.
 *
 * `within` was the whole of finding 616's gain -- the same agreement is *forced* inside a population
 * and *the corpus* outside one -- and it was one word for two cases: `8 row(s)` was printed as a
 * coincidence across two gates on the same line whose own sentence says the two tables are four
 * tables and one word (finding 627). A marker that cannot tell "the record says these differ" from
 * "nobody has looked" is a marker a reader learns to ignore, which is how the real hint is lost.
 */
export function coincidencesOf(census, judgements = new Map()) {
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
    const { declared, judgement } = stateOf(census, judgements, noun);
    const groups = declared ? (partitionOf(judgement) ?? []) : [];
    const placed = new Set(groups.flat());
    // A gate declared separate is placed, and placed as something that is not a population: its
    // number is not a count of the noun, so it cannot be a member of a shared set either.
    for (const one of declared ? separateOf(judgement) : []) if (one.gate !== null) placed.add(one.gate);
    for (const [count, one] of byCount) {
      if (one.size < 2) continue;
      const gates = [...one].sort();
      // One group holding *every* gate, not every gate held by some group: two gates in two
      // populations of one are placed and apart, which is the case this classification exists for.
      const placement = groups.some((group) => gates.every((gate) => group.includes(gate)))
        ? 'together'
        : gates.some((gate) => !placed.has(gate))
          ? 'unplaced'
          : 'apart';
      out.push({ noun, count, gates, placement });
    }
  }
  return out.sort((a, b) => a.noun.localeCompare(b.noun) || a.count - b.count);
}

/**
 * The populations a record declares one whose gates have stopped agreeing, with their counts.
 *
 * This is the check the nine sentences never had. One of two gates changes its reader, the two stop
 * counting one set, and the sentence that says they do stays printed -- the failure `O-097` named as
 * "a relation that has stopped being true stays printed". The numbers are the whole of the evidence
 * and the record is the whole of the repair, so both are named.
 *
 * A judgement whose partition does not cover its gates is skipped rather than reported twice: that
 * is `partitionProblems`' refusal and it comes first, because a group drawn around the wrong gates
 * would make this check ask the wrong question.
 */
export function disagreementsOf(census, judgements = new Map()) {
  const out = [];
  for (const { noun, gates } of sharedNounsOf(census)) {
    const state = stateOf(census, judgements, noun);
    // A judgement whose partition does not cover this run's gates is skipped rather than reported
    // twice: that is `partitionProblems`' refusal and it comes first, because a group drawn around
    // the wrong gates would make this check ask the wrong question.
    if (!state.declared) continue;
    for (const group of partitionOf(state.judgement) ?? []) {
      if (group.length < 2) continue;
      const { common, counts, unread } = agreementOf(census, noun, group);
      if (common.length > 0 && unread.length === 0) continue;
      out.push({ noun, gates: group, counts, unread });
    }
  }
  return out.sort((a, b) => a.noun.localeCompare(b.noun));
}

/**
 * The shared nouns whose record states no relation, and the ones whose record states no partition.
 *
 * Two states because they are two repairs: a sentence nobody wrote, and a partition nobody placed.
 * The gate used to recognise the first by the *text of the line it had just printed* -- comparing a
 * constant with itself -- which was a string standing in for a fact about the document.
 */
export function unstatedOf(census, judgements = new Map()) {
  return sharedNounsOf(census)
    .filter(({ noun }) => {
      const relation = judgementFor(judgements, noun)?.relation;
      return relation == null || relation === '';
    })
    .map(({ noun, gates }) => ({ noun, gates }));
}

export function unpartitionedOf(census, judgements = new Map()) {
  const out = [];
  for (const { noun, gates } of sharedNounsOf(census)) {
    // A noun with no judgement at all is `unstatedOf`'s: one refusal per missing thing, so the
    // message a person reads is the one they have to act on first.
    if (judgementFor(judgements, noun) === undefined) continue;
    const problems = stateOf(census, judgements, noun).problems;
    if (problems.length > 0) out.push({ noun, gates, problems });
  }
  return out;
}

/**
 * Every number a noun is printed with, grouped by the populations the record declares.
 *
 * A group of two is printed as two numbers and a note saying whether they agree, because that is the
 * claim the partition is making: `474 in check-comments-language; 474 in check-doc-counts (one
 * population at 474, and the count agrees)`. The per-gate numbers are kept rather than collapsed to
 * the common one, because a gate's extra number is a population of its own -- `50 `Pass` round(s)`
 * beside `221 `vX.YY` round(s)` -- and dropping it would be finding 611 one line over.
 *
 * Exported because the gate's refusal for an unwritten sentence quotes the same words: a refusal
 * assembled from the census and a line assembled from the census should not be two sentences that
 * can drift, and the first version of this gate did exactly that with a `lastIndexOf`.
 */
export function numbersOfNoun(census, judgements, noun) {
  const perGate = census.get(noun);
  const state = stateOf(census, judgements, noun);
  const groups = state.declared ? (partitionOf(state.judgement) ?? []) : state.gates.map((gate) => [gate]);
  // The two kinds are printed in two runs rather than interleaved by gate name: the populations are
  // the counts of the noun, and the declarations are the numbers that are not counts of it, so a
  // reader who wants the population can stop at the first declaration. `measures` is `null` for a
  // population, and the difference is the whole of what this line now says.
  const entries = [
    ...groups.map((group) => ({ gates: group, measures: null })),
    ...(state.declared
      ? separateOf(state.judgement)
          .filter((one) => one.gate !== null)
          .map((one) => ({ gates: [one.gate], measures: one.counts ?? '' }))
      : []),
  ];
  const said = entries.map(({ gates: group, measures }) => {
    const numbers = group.map((gate) => {
      const uses = perGate.get(gate) ?? [];
      const counted = numbersOf(uses);
      if (counted.length === 0) return `no number in ${gate}`;
      // The qualifier travels with its number, because the qualifier is what says which population
      // the number counts: `219 `vX.YY` round(s)` and `50 `Pass` round(s)` are two lines of one
      // summary, and a reader given `219, 50` has been handed finding 600's pair.
      const written = counted.map((count) => {
        const use = uses.find((one) => one.count === count);
        return use.qualifier === null ? String(count) : `${String(count)} ${use.qualifier}`;
      });
      return `${written.join(', ')} in ${gate}`;
    });
    if (measures !== null) return `${numbers[0]} (declared separate: ${measures})`;
    if (group.length === 1) return numbers[0];
    const { common, unread } = agreementOf(census, noun, group);
    const note =
      unread.length > 0
        ? 'one population, and one of them states no number this reader can read'
        : common.length === 0
          ? 'one population, and no count is common to them'
          : `one population at ${common.join(', ')}, and ${common.length === 1 ? 'the count agrees' : 'the counts agree'}`;
    return `${numbers.join('; ')} (${note})`;
  });
  return said.join('; ');
}

/**
 * One line per shared noun: every gate's numbers, the populations they are read as, and the relation
 * the inventory records.
 *
 * This is the sentence the census was missing (finding 609). Its old summary said `volume(s) by 2`
 * -- the gates' *names*, never their numbers -- so a reader of this gate alone could not see that
 * one gate prints **14** volumes and the other **18**, let alone whether they are the same
 * fourteen. The two numbers were each printed by their own gate, forty lines apart in one log,
 * which is finding 600 one gate out: the reader that exists to hold two populations of one word
 * together held the names and dropped the numbers.
 *
 * The marker for an agreement is two different sentences now (findings 616 and 627): a coincidence
 * a declared population holds needs none, because the numbers line has just said `one population at
 * 8, and the count agrees`; and the two that remain -- a size between sets the record says differ,
 * and an equality nobody has placed -- are separate sentences, because only the second is a question.
 * Each of them opens with the count it is about (`O-107`), so a noun carrying two coincidences
 * prints two sentences rather than one that is true of half of them.
 * The paragraph is kept, so a reader can see which of the three they are looking at.
 */
export function relationsOf(census, judgements = new Map()) {
  const coincident = coincidencesOf(census, judgements);
  return sharedNounsOf(census).map(({ noun }) => {
    const { judgement } = stateOf(census, judgements, noun);
    const mine = coincident.filter((one) => one.noun === noun);
    const relation = judgement?.relation;
    return (
      `${noun} — ${numbersOfNoun(census, judgements, noun)}${markersOf(mine)}` +
      ` — ${relation == null || relation === '' ? UNSTATED : relation}`
    );
  });
}

/**
 * What each equality of two gates' counts is, as a parenthetical that names the count it is about.
 *
 * One sentence per coincidence rather than one per noun (`O-107`). The old marker spoke for the
 * noun, and a noun can carry two coincidences: `a` and `b` print `8` inside one population while
 * `c` and `d` print `9` from populations of their own, and the line then read `(a count two gates
 * print agrees, and the record places them in different sets)` -- true of the `9`, false of the
 * `8`, and printed once, so a reader could not tell which number the sentence was about. Naming
 * the count costs one word per sentence and makes each of them the property of exactly one number.
 *
 * A coincidence held together by a declared population needs no marker: the line has already said
 * `one population at 8, and the count agrees`, and repeating it as a warning is how a marker stops
 * being read as a warning. The other two classes are named -- a size between two sets the record
 * says differ, and an equality nobody has placed -- because the first is a decision already made and
 * the second is the one still owed (finding 627).
 *
 * The old version was one sentence by construction, and the argument was that `unplaced` holds only
 * for an undeclared noun while `apart` holds only for a declared one, because `partitionProblems`
 * refuses a partition that leaves a gate unplaced. That argument is still true and no longer load
 * bearing: each sentence is now built from the coincidence it is printed for, so a noun with three
 * of them prints three sentences and no case has to be proved unreachable first.
 */
function markersOf(mine) {
  const said = [];
  for (const one of mine) {
    const what =
      one.placement === 'unplaced'
        ? 'a count two gates print agrees, and no population places them'
        : one.placement === 'apart'
          ? 'a count two gates print agrees, and the record places them in different sets'
          : null;
    if (what !== null) said.push(`at ${String(one.count)}, ${what}`);
  }
  return said.length === 0 ? '' : ` (${said.join('; ')})`;
}

/**
 * The census as one sentence, with the numbers that need explaining explained by the lines below.
 *
 * `judgements` is what the inventory holds and this function cannot derive, and the summary says how
 * much of it a run checks rather than reciting it: a population two gates are declared to share has
 * a consequence in numbers, and the clause counts those, because "nine sentences were written" and
 * "three equalities are checked" are different amounts of assurance and the second is the one this
 * round bought.
 */
export function summaryOf(census, judgements = new Map()) {
  const uses = [...census.values()].reduce((all, perGate) => all + perGate.size, 0);
  const shared = sharedNounsOf(census);
  const stated = shared.filter(({ noun }) => {
    const relation = judgementFor(judgements, noun)?.relation;
    return relation != null && relation !== '';
  });
  const coincidences = coincidencesOf(census, judgements);
  const unreadable = unreadableOf(census);
  const parts = [];
  parts.push(
    `${String(census.size)} unit noun(s) in ${String(uses)} gate/noun pair(s); ` +
      (shared.length === 0
        ? 'none of them is printed by more than one gate'
        : `${String(shared.length)} of them are printed by more than one gate, and ` +
          `${String(stated.length)} of those say what the other one counts`),
  );
  let populations = 0;
  let agreeing = 0;
  // The ledger: every gate the record places under a shared noun, with the three ways of placing one.
  // Printed because the old summary counted populations and stopped, so a reader could not tell a
  // record of six placements from a record of twenty-two -- and the number that is not a count of its
  // noun was one of the sixteen the clause did not mention (`O-104`).
  let placements = 0;
  let inPopulations = 0;
  let inPopulationsOfOne = 0;
  let separated = 0;
  for (const { noun } of shared) {
    const state = stateOf(census, judgements, noun);
    if (!state.declared) continue;
    for (const group of partitionOf(state.judgement) ?? []) {
      placements += group.length;
      if (group.length < 2) {
        inPopulationsOfOne += group.length;
        continue;
      }
      inPopulations += group.length;
      populations += 1;
      const { common, unread } = agreementOf(census, noun, group);
      if (common.length > 0 && unread.length === 0) agreeing += 1;
    }
    const apart = separateOf(state.judgement).filter((one) => one.gate !== null);
    placements += apart.length;
    separated += apart.length;
  }
  parts.push(
    populations === 0
      ? 'no population is read by more than one gate, so no equality between two gates is checked'
      : `${String(populations)} population(s) are read by more than one gate, and ` +
        `${String(agreeing)} of them agree on a count`,
  );
  if (placements > 0) {
    parts.push(
      `${String(placements)} placement(s) of those nouns: ${String(inPopulations)} in populations two or more gates read, ` +
        `${String(inPopulationsOfOne)} in populations of one gate, ${String(separated)} declared separate`,
    );
  }
  // Three counts rather than two, and all three printed in both states: `inside a population and
  // across two` was one word for a size between sets the record says differ and an equality nobody
  // has examined, and the second is the only one that is evidence (finding 627). A class printed at
  // zero is what keeps a coincidence from leaving the line without a trace -- the discipline
  // `ledgerWhere` took at v3.133, applied to the marker.
  const together = coincidences.filter((one) => one.placement === 'together').length;
  const apart = coincidences.filter((one) => one.placement === 'apart').length;
  parts.push(
    coincidences.length === 0
      ? 'no count of 1 or more is printed by two gates under one noun'
      : `${String(coincidences.length)} count(s) coincide across gates -- ` +
        `${String(together)} where a declared population holds every gate that prints one, ` +
        `${String(apart)} where declared populations keep them apart, ` +
        `${String(coincidences.length - together - apart)} where no population places them: ` +
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
