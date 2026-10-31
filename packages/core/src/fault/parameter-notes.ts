/**
 * What a case has to say about the facts it declares and no reading cites.
 *
 * ## The defect this answers
 *
 * `fault.parameters` holds a case's own facts, and a reading may cite one with `{ parameter: 'name' }`
 * so that the number in the series and the number in the injection spec cannot drift apart (finding
 * 258). Measured before this module existed: **69 of 98 keys were cited by nothing**, across all
 * thirty cases, and every case had at least one.
 *
 * Most of those are legitimately descriptive -- `service`, `from`, `trigger`, `container` are written
 * for a reader and for a future replay. Some are numbers a reading restates by hand, which is the
 * drift the mechanism exists to prevent. Nothing in the file distinguishes the two, so finding 300
 * refused both available rules: refusing every uncited key fails thirty cases for thirty legitimate
 * reasons, and an allow-list of descriptive names encodes today's list as a law and refuses the next
 * case's `pod`.
 *
 * The question left is the one only the author can answer, and it is a question rather than a
 * taxonomy: *what is this fact for, and why does no reading cite it*. `fault.parameterNotes` is where
 * that answer goes, one sentence per key, and this module is what refuses a case that does not give
 * one -- or gives one in a place that turns it into a second statement.
 *
 * ## What a guard can and cannot check
 *
 * It checks presence, placement and shape. It cannot check that the sentence is true, and it does
 * not pretend to: a note is prose, and prose is checked by a reader.
 *
 * Three placements are refused, and each is a defect this corpus has had in another form:
 *
 * - a note on a key **a reading cites** is a second statement of the fact, and the two can drift --
 *   the same shape as `expression` beside `signalRef` (finding 244);
 * - a note on a key **the case does not declare** is what a rename leaves behind, and it reads as an
 *   explanation of something nobody can find;
 * - a note that **is a label** ("the service", "config") answers the question with the key's own
 *   name. `MIN_NOTE_LENGTH` and a closing period are crude, and they are the two properties a label
 *   lacks: a label is shorter than a clause and does not end.
 */

/**
 * How short a note may be before it is a label rather than a sentence.
 *
 * Not a measure of quality -- the shortest note the shipped corpus carries is longer than this --
 * but the point below which a string cannot say what a fact is for *and* why nothing cites it. A
 * note that clears this floor can still be wrong, and that is stated rather than papered over.
 */
export const MIN_NOTE_LENGTH = 40;

/** Why a case's notes do not answer for its parameters. */
export type ParameterNoteFault =
  | { kind: 'unreadable'; notes: unknown }
  | { kind: 'missing'; key: string }
  | { kind: 'stray'; key: string; declared: readonly string[] }
  | { kind: 'cited'; key: string }
  | { kind: 'label'; key: string; note: string }
  | { kind: 'notText'; key: string; note: unknown };

export interface ParameterNotesReport {
  readonly faults: readonly ParameterNoteFault[];
  /** How many keys the case declares. */
  readonly declared: number;
  /** How many of them a reading cites, and which therefore need no note. */
  readonly cited: number;
  /** How many carry a note, which is the number the guard prints on both exits. */
  readonly noted: number;
  /** Length of the shortest note on an uncited key, or 0 when there is none. */
  readonly shortest: number;
}

function isNoteMap(notes: unknown): notes is Record<string, unknown> {
  return typeof notes === 'object' && notes !== null && !Array.isArray(notes);
}

function isSentence(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= MIN_NOTE_LENGTH && trimmed.endsWith('.');
}

/** The type of a note map that is not a map, in the words the refusal uses for it. */
function describeKind(value: unknown): string {
  return Array.isArray(value) ? 'an array' : `a ${typeof value}`;
}

/**
 * Read a case's notes against the keys it declares, and report every way they do not answer.
 *
 * `cited` is the set of keys a reading already speaks for -- a series point or a configuration
 * checkpoint. It is passed in rather than derived here because the two routes that produce it live
 * in the guard, and a second derivation would be the second answer this campaign keeps deleting.
 */
export function checkParameterNotes(input: {
  parameters: Readonly<Record<string, unknown>>;
  notes: unknown;
  cited: Iterable<string>;
}): ParameterNotesReport {
  const keys = Object.keys(input.parameters);
  const cited = new Set(input.cited);
  const declared = keys.length;
  const citedCount = keys.filter((key) => cited.has(key)).length;

  // An absent map and a null one both read as "nothing explained", because a case that cites every
  // key it declares needs no notes and JSON has no way to say "not applicable" other than this. A
  // map that is present but not a map is a different thing, and it is refused as itself rather than
  // reported as sixty-nine missing notes.
  if (input.notes === undefined || input.notes === null) {
    const faults = keys.filter((key) => !cited.has(key)).map((key): ParameterNoteFault => ({ kind: 'missing', key }));
    return { faults, declared, cited: citedCount, noted: 0, shortest: 0 };
  }
  if (!isNoteMap(input.notes)) {
    return { faults: [{ kind: 'unreadable', notes: input.notes }], declared, cited: citedCount, noted: 0, shortest: 0 };
  }

  const notes = input.notes;
  const faults: ParameterNoteFault[] = [];
  let noted = 0;
  let shortest = 0;

  for (const key of keys) {
    if (cited.has(key)) continue;
    if (!Object.hasOwn(notes, key)) {
      faults.push({ kind: 'missing', key });
      continue;
    }
    const note = notes[key];
    if (typeof note !== 'string') {
      faults.push({ kind: 'notText', key, note });
      continue;
    }
    noted += 1;
    shortest = shortest === 0 ? note.trim().length : Math.min(shortest, note.trim().length);
    if (!isSentence(note)) faults.push({ kind: 'label', key, note });
  }

  for (const key of Object.keys(notes)) {
    if (!Object.hasOwn(input.parameters, key)) {
      faults.push({ kind: 'stray', key, declared: keys });
      continue;
    }
    // Placement is decided before shape: a note on a cited key is refused as a second statement,
    // which is the defect, rather than as a short sentence, which would be the symptom.
    if (cited.has(key)) faults.push({ kind: 'cited', key });
  }

  return { faults, declared, cited: citedCount, noted, shortest };
}

/** The sentence a reader of the guard's output gets for each way a case's notes fall short. */
export function describeParameterNoteFault(fault: ParameterNoteFault, caseId: string): string {
  switch (fault.kind) {
    case 'unreadable':
      return (
        `'${caseId}' carries fault.parameterNotes as ${describeKind(fault.notes)}, and it has to be an ` +
        'object from parameter name to the sentence that explains it'
      );
    case 'missing':
      return (
        `'${caseId}' declares '${fault.key}' and no reading cites it, and fault.parameterNotes says ` +
        'nothing about it -- a key nothing reads is either a fact a reader needs, which the note ' +
        'states, or a number a reading should have cited'
      );
    case 'stray':
      return (
        `'${caseId}' explains '${fault.key}' in fault.parameterNotes, and fault.parameters declares no ` +
        `such key (it declares: ${fault.declared.join(', ') || 'nothing'})`
      );
    case 'cited':
      return (
        `'${caseId}' carries a note for '${fault.key}' and a reading cites it -- the citation is the ` +
        'statement, and a note beside it is a second one that can drift'
      );
    case 'label':
      return (
        `'${caseId}' explains '${fault.key}' with '${fault.note}', which is a label: a note says what the ` +
        `fact is for and why no reading cites it, in at least ${String(MIN_NOTE_LENGTH)} characters`
      );
    case 'notText':
      return `'${caseId}' explains '${fault.key}' with ${JSON.stringify(fault.note)}, and a note is a sentence of text`;
  }
}
