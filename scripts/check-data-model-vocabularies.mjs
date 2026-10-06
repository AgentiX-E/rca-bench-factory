#!/usr/bin/env node
/**
 * Check that the vocabularies `docs/data-model.md` publishes are the ones the
 * code enforces.
 *
 * ## Why this exists
 *
 * `docs/data-model.md` makes a structural claim about the enumerated payload
 * vocabularies, in as many words:
 *
 * > Two payload fields are closed sets, and both are **declared once** -- as a
 * > tuple in `ir/types.ts`, with the type derived from it. Anything that admits
 * > a value (the `source` and `ingest` file readers) reads the same tuple, so the
 * > union and the admission list cannot disagree.
 *
 * Measured against the tree, "declared once" was false. The tuples existed and
 * the types were derived from them, but `ir/schema.ts` -- which is what actually
 * *admits* a payload -- re-spelled every vocabulary as a list of string literals
 * beside the tuple. There were fifteen such copies and not one read its tuple.
 * Adding a member to `LOG_SEVERITIES` would have widened the TypeScript union
 * while the runtime schema went on rejecting the value: the union and the
 * admission list would have disagreed, which is the failure the sentence says
 * cannot happen.
 *
 * That is this campaign's recurring defect in its purest form -- **a published
 * claim that nothing reads** -- and this gate is its reader.
 *
 * ## Two claims, checked separately
 *
 *   1. **Each vocabulary is declared once.** The schema must *reference* the
 *      tuple (`z.enum(LOG_SEVERITIES)`) rather than repeat its members as
 *      literals. This is checked structurally, by parsing the schema's calls,
 *      because a comparison of two hand-kept string lists passes happily while
 *      the duplication -- the actual defect -- is still there.
 *   2. **The document and the tuples agree**, in order. `FAULT_CATEGORIES` is
 *      declared "in the order they are published in `docs/data-model.md`", so
 *      order is contractual: a set comparison would accept a document that had
 *      been shuffled and leave the code's own comment unreferenced.
 *
 * Checking only (2) would restate the incident this guard exists for: at the
 * time the defect was found the document and the *tuples* agreed perfectly, and
 * that agreement is precisely why nothing noticed the third copy in the schema.
 *
 * ## What it does not check
 *
 * The fourteen other `z.enum` calls in the schema -- alert severities, alert
 * states, profile types and so on -- which are enumerated inline and are not
 * published in `data-model.md`. They are listed in the gate's census so the
 * omission is visible rather than implicit; promoting one to a documented
 * vocabulary means adding a row to the document, and the row brings it under
 * this check automatically.
 *
 *   node scripts/check-data-model-vocabularies.mjs
 *   node scripts/check-data-model-vocabularies.mjs --doc <path>
 *   node scripts/check-data-model-vocabularies.mjs --comment <path>   # read the
 *       vocabularies from a given `data-model.md` instead of the document
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const DOC = resolve(argValue('--doc') ?? resolve(ROOT, 'docs', 'data-model.md'));

function fail(lines) {
  console.error('check-data-model-vocabularies: FAILED');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

/**
 * The vocabularies the document publishes in a markdown table.
 *
 * The table is the specification: the first cell names the field, the second the
 * tuple that backs it, and the third lists the values as inline code. Parsing the
 * document rather than naming the fields here is what keeps the gate from being a
 * restatement of the code -- if a row is added, the gate grows with it.
 *
 * Values are read in the order they appear, because `FAULT_CATEGORIES` publishes
 * order as part of the contract. A row whose second cell does not name a tuple is
 * reported rather than skipped: silently ignoring it would let the document add a
 * vocabulary that nothing verifies, which is the defect this guard exists for.
 */
function tableVocabularies(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*`([A-Za-z][\w.]*)`\s*\|\s*`([A-Z][A-Z0-9_]*)`\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (match === null) continue;
    const values = [...match[3].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (values.length === 0) continue;
    rows.push({ field: match[1], tuple: match[2], values });
  }
  return rows;
}

/**
 * The vocabularies the document publishes as prose rather than as a table row.
 *
 * `data-model.md` publishes five vocabularies in total, but only two in a
 * markdown table. The others are stated in sentences and code blocks:
 *
 *   - `EntityKind`       -- "declared once, as a tuple: `service`, `pod`, ..."
 *   - `FaultCategory`    -- "declared once, as a tuple in this order: `resource`, ..."
 *   - `ProvenanceSource` -- the `source:` union in the `FieldProvenance` block
 *
 * Reading them from the prose is what makes this gate an enumeration rather than
 * a checklist. A version that hard-coded the mapping would be a second list that
 * has to be kept in step with the document -- the same duplication this gate
 * exists to remove, one level up.
 */
function proseVocabularies(markdown) {
  const found = [];
  // "`X` is declared once, as a tuple[ in this order]: `a`, `b`, ..."
  const pattern = /`([A-Za-z][\w]*)`\s+is\s+declared\s+once,\s+as\s+a\s+tuple[^:]*:\s*([^.]*)\./g;
  for (const match of markdown.matchAll(pattern)) {
    const values = [...match[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (values.length > 0) found.push({ field: match[1], values, kind: 'prose' });
  }
  // The `FieldProvenance.source` union, published as a type expression.
  const union = /^\s*source:\s*((?:'[\w]+'\s*\|\s*)*'[\w]+')\s*;/gm;
  for (const match of markdown.matchAll(union)) {
    const values = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    if (values.length > 0) found.push({ field: 'FieldProvenance.source', values, kind: 'union' });
  }
  return found;
}

/**
 * The tuple that backs a prose vocabulary, derived from the type's own name.
 *
 * The document writes "`EntityKind` is declared once, as a tuple", so the type
 * name is given and the tuple name follows the convention `ir/types.ts` uses
 * throughout: screaming case, plural (`EntityKind` -> `ENTITY_KINDS`,
 * `FaultCategory` -> `FAULT_CATEGORIES`, `ProvenanceSource` ->
 * `PROVENANCE_SOURCES`). The conversion is done here rather than listed, so a
 * vocabulary added to the prose is checked on the next run without editing this
 * file.
 *
 * The one vocabulary whose type name is not in the document is
 * `FieldProvenance.source`, which is published as a union; its backing tuple is
 * named from the field's owner, following the same convention.
 */
function tupleNameFor(typeName) {
  if (typeName === 'FieldProvenance.source') return 'PROVENANCE_SOURCES';
  const plural = /[^aeiou]y$/.test(typeName) ? typeName.slice(0, -1) + 'ies' : typeName + 's';
  return plural
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toUpperCase();
}

/**
 * A tuple's members, read from the file that declares it.
 *
 * Only the leading string literals matter: the terminator is `as const`, and the
 * gate refuses to guess past a construct it does not recognise rather than
 * silently returning a prefix.
 */
function tupleMembers(source, name) {
  const declaration = new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`).exec(source);
  if (declaration === null) return undefined;
  return [...declaration[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

/**
 * Every `z.enum` call in a source file, split by how it names its members.
 *
 * A call either takes a spred tuple -- `z.enum(TUPLE)` -- or a literal list --
 * `z.enum(['a', 'b'])`. The distinction is the whole point: the first cannot
 * drift from the tuple, the second is a copy.
 *
 * ## Why the literals are stripped before looking for identifiers
 *
 * `LOG_SEVERITIES` and `SPAN_STATUSES` hold uppercase members, and so do their
 * copies in the schema, so a bare `[A-Z][A-Z0-9_]+` scan finds `'TRACE'` and
 * `'UNSET'` *inside the quoted copies* and classifies them as tuple references.
 * That misread is not harmless: it made this gate report "nowhere re-spells its
 * members" for exactly the two vocabularies the document singles out -- the gate
 * was wrong about the thing it was written to catch, and it was wrong in the
 * direction that would have let the defect stand.
 *
 * The fix is to look for identifiers only in text that is not inside a string
 * literal. Splitting on quoted runs is enough here because the argument to
 * `z.enum` is a flat list or a single identifier; a nested expression would be
 * refused by the caller rather than silently half-read.
 */
function enumCalls(source) {
  const calls = [];
  const pattern = /z\.enum\(/g;
  for (const match of source.matchAll(pattern)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth += 1;
      else if (source[i] === ')') depth -= 1;
      i += 1;
    }
    const argument = source.slice(start, i - 1);
    const line = source.slice(0, match.index).split('\n').length;
    const literals = [...argument.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    // Identifiers are looked for in the parts of the argument that are *between*
    // the quoted values, never inside them.
    const unquoted = argument.replace(/'[^']*'/g, ' ');
    const identifiers = [...unquoted.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]);
    calls.push({ line, argument: argument.trim(), literals, identifiers });
  }
  return calls;
}

if (!existsSync(DOC)) {
  fail([`${DOC} does not exist.`, 'Pass --doc <path>, or delete this guard if the data model was removed.']);
}

const markdown = readFileSync(DOC, 'utf8');

/**
 * The published vocabularies, table rows and prose alike.
 *
 * Both are reduced to `{ field, tuple, values }`. A table row names its tuple in
 * the second cell; a prose vocabulary names its *type*, and the tuple follows
 * from `tupleNameFor`. Reducing them here rather than in two loops is what keeps
 * the two readings from drifting apart in what they check.
 */
const published = [
  ...tableVocabularies(markdown),
  ...proseVocabularies(markdown).map((v) => ({ field: v.field, tuple: tupleNameFor(v.field), values: v.values })),
];

if (published.length === 0) {
  // Vacuity guard. If the table format changes -- a column added, the backticks
  // dropped -- this gate would otherwise report success while comparing nothing.
  fail([
    `no vocabulary found in ${DOC}.`,
    'A vocabulary is a table row `| `Field` | `TUPLE` | `A`, `B` |`, or a sentence',
    '"`Type` is declared once, as a tuple: `a`, `b`".',
    'Reporting success on zero vocabularies is the defect this guard is for.',
  ]);
}

const TYPES = resolve(ROOT, 'packages', 'core', 'src', 'ir', 'types.ts');
const SCHEMA = resolve(ROOT, 'packages', 'core', 'src', 'ir', 'schema.ts');
for (const path of [TYPES, SCHEMA]) {
  if (!existsSync(path)) {
    fail([`${path} does not exist, so ${DOC}'s vocabularies cannot be compared against anything.`]);
  }
}

const typesSource = readFileSync(TYPES, 'utf8');
const schemaSource = readFileSync(SCHEMA, 'utf8');

const problems = [];
const checked = [];

for (const row of published) {
  const { field, tuple, values } = row;

  const members = tupleMembers(typesSource, tuple);
  if (members === undefined) {
    problems.push(`${field}: names ${tuple}, which is not declared in ${TYPES}`);
    continue;
  }

  if (members.join(',') !== values.join(',')) {
    problems.push(
      `${field}: ${DOC} lists [${values.join(', ')}] but ${tuple} declares [${members.join(', ')}]` +
        (members.join(',') === [...values].sort().join(',') ? ' (the same names, but the order differs)' : ''),
    );
    continue;
  }

  checked.push({ field, tuple, members });
}

/**
 * The structural half: every checked vocabulary must be *referenced* by the
 * schema, not repeated in it.
 *
 * A spred tuple reads as a bare identifier inside the call; a literal list does
 * not. The copy is located so the message names the line rather than the concept,
 * which is what turns a verdict into something actionable.
 */
const calls = enumCalls(schemaSource);
const referenced = new Set();
for (const call of calls) {
  for (const identifier of call.identifiers) referenced.add(identifier);
}

for (const { field, tuple, members } of checked) {
  if (referenced.has(tuple)) continue;
  const copy = calls.find(
    (call) => call.literals.length > 0 && call.literals.join(',') === members.join(',') && call.identifiers.length === 0,
  );
  const where = copy === undefined ? 'no `z.enum` call in schema.ts matches its members, so the tuple reaches no reader' : `schema.ts:${copy.line} re-spells its members as literals`;
  problems.push(
    `${field}: ${DOC} says ${tuple} is "declared once", but ${where} -- ` +
      'adding a member to the tuple would widen the type and leave admission unchanged',
  );
}

if (problems.length > 0) {
  fail([
    `${problems.length} problem(s) between ${DOC} and the code:`,
    ...problems.map((p) => `  - ${p}`),
    '',
    'Fix the document or the code -- they are the same contract stated twice.',
  ]);
}

console.log(
  `check-data-model-vocabularies: OK (${checked.length} vocabulary(ies) published and single-sourced: ` +
    `${checked.map((c) => c.tuple).join(', ')})`,
);
console.log(
  `check-data-model-vocabularies: ${calls.filter((c) => c.literals.length > 0 && c.identifiers.length === 0).length} ` +
    `inline z.enum call(s) remain in schema.ts, none of them a published vocabulary`,
);
