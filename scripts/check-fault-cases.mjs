#!/usr/bin/env node
/**
 * Every fault case in the corpus is annotated in all four layers, and its references answer.
 *
 * M1's exit condition says "GT four-layer annotation (entity / fault / process / evidence) can
 * all be filled". Nothing checked it: `causalChain` and `evidenceCheckpoints` are optional in
 * the schema, `rootCauseEntityId` is a string that no code resolves, and every case in this
 * repository carried a type and a component and nothing else. A condition nobody can check is
 * met by definition -- which is the state this guard exists to end.
 *
 * `assessFourLayer` is the definition; this is the guard. It walks
 * `golden-master/fault-cases/index.json`, parses each case and its graph through the shipped
 * schemas, asks the core module whether the four layers are filled and every reference
 * resolves, and refuses the whole file if any case is incomplete.
 *
 * ## The count is reported, not gated
 *
 * One of thirty extraction samples carries a four-layer case today. Requiring thirty would make
 * the guard red for the next thirty rounds and teach everyone to ignore it; requiring nothing
 * would let the number go to zero in silence. So the count is printed on every run and
 * `min` in the index is the floor, raised as annotation proceeds -- the same shape
 * `M1_STRICT_THRESHOLD` has, and for the same reason: a threshold that is not written down is
 * a threshold that drifts.
 *
 * ## Why the sample ids are cross-checked
 *
 * A case annotated from an incident that is not in the extraction key is not wrong, but it is
 * a case nobody can compare against the thing it came from. The link is what makes "1 of 30"
 * mean something, so a `sampleId` the key does not carry fails here rather than being counted
 * toward coverage that does not exist.
 *
 * Usage:
 *   node scripts/check-fault-cases.mjs [--cases <dir>] [--samples <file>]
 *
 * Exit codes:
 *   0  every case is complete, every reference resolves, and the count is at or above the floor
 *   1  an input could not be read, or a case does not parse, or a sample id is unknown
 *   2  a case is incomplete, or the count is below the floor
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DEFAULT_CASES = resolve(REPO, 'golden-master', 'fault-cases');
const DEFAULT_SAMPLES = resolve(REPO, 'golden-master', 'fault-extraction', 'samples.json');
const INDEX_SCHEMA = 'rca-bench-fault-cases/2';

function parseArgs(argv) {
  const out = { cases: DEFAULT_CASES, samples: DEFAULT_SAMPLES };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cases') out.cases = resolve(argv[(index += 1)] ?? '');
    else if (arg === '--samples') out.samples = resolve(argv[(index += 1)] ?? '');
    else if (arg === '--help' || arg === '-h') out.help = true;
    else {
      console.error(`check-fault-cases: unknown argument '${arg}'`);
      console.error('usage: node scripts/check-fault-cases.mjs [--cases <dir>] [--samples <file>]');
      process.exit(1);
    }
  }
  return out;
}

async function loadCore() {
  return await import(resolve(REPO, 'packages/core/dist/index.js'));
}

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`check-fault-cases: could not read the ${what} at ${path}: ${String(error instanceof Error ? error.message : error)}`);
    process.exit(1);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log('usage: node scripts/check-fault-cases.mjs [--cases <dir>] [--samples <file>]');
  process.exit(0);
}

const core = await loadCore();
const index = readJson(join(args.cases, 'index.json'), 'case index');
if (index.schema !== INDEX_SCHEMA) {
  console.error(`check-fault-cases: the index has schema '${String(index.schema)}', not '${INDEX_SCHEMA}'`);
  process.exit(1);
}
if (!Array.isArray(index.cases)) {
  console.error("check-fault-cases: the index has no 'cases' array");
  process.exit(1);
}
const samples = readJson(args.samples, 'extraction key');
const sampleById = new Map((samples.samples ?? []).map((sample) => [sample?.id, sample]));
const known = new Set(sampleById.keys());

const LAYERS = ['entity', 'fault', 'process', 'evidence'];
const MIN_QUOTE = 12;

/** Whitespace-folded, so a quote is compared on its words rather than on a line break. */
function fold(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * A computed value as a person wrote it, without pretending it is exact.
 *
 * `0.06 / 0.02` is `2.9999999999999996`, and a failure message that prints all seventeen digits makes
 * the author hunt for a difference that is not there. Twelve significant digits is finer than the
 * `RELATIVE_TOLERANCE` the comparison uses, so nothing reported as equal can print as unequal.
 */
function displayNumber(value) {
  return String(Number(value.toPrecision(12)));
}

/**
 * The corpus's derived telemetry is constructed in `core`, not here.
 *
 * It used to live in this file, and that is why a defect in it survived three rounds: the guard
 * prints counts of files and checkpoints, never the sample values it produced, so the arithmetic was
 * a change no test could disagree with. `fault/derived-telemetry.ts` holds it now, with the samples
 * asserted directly (finding 249).
 */
const DERIVATIONS = core.SERIES_DERIVATIONS;

/** Whether a declared series carries sampling noise, read from the module that applies it. */
const NOISE = core.SERIES_NOISE;

/** The two timestamps the expansion needs, read from the case rather than passed around. */
function expansionTime(faultCase) {
  return { windowStart: faultCase.window.start, onset: faultCase.injectTime, windowEnd: faultCase.window.end };
}

/**
 * A declared series with its two readings resolved, which is the only form the expansion may be given.
 *
 * A reading is either a number or a `{ parameter }` reference to a quantity the case declares about
 * itself (finding 258). The rules above read the resolved hash, and the expansion reads the *file* --
 * so a declaration passed through unchanged gives `declaration.post - declaration.baseline` as
 * `object - number`, which is `NaN`, and the expansion then produces sixteen `NaN` samples with no
 * complaint. Nothing downstream would complain either: `Math.abs(NaN) >= 2` is false, so such a
 * series is invisible to G3 and to both baselines at once.
 *
 * This function exists because the round that added the count rule below called the expansion with
 * the raw declaration, and the guard then reported `client_pool_connections_in_use` as `NaN` -- a
 * defect in the rule, filed against the corpus. The rule is gone (finding 285) and the resolution
 * stays, because the call it was written for is the one thing below that must not read the file.
 */
function resolvedDeclaration(one, readings) {
  return { ...one, ...(readings.get(readingKey(one)) ?? {}) };
}

/**
 * The key a reading is filed under: the entity and the metric, not the metric alone.
 *
 * A series is a quantity taken *on* something, so `(entity, metric)` is its identity -- the pair
 * `fault/background.ts` uses to let a case's own declaration win over the background, and the pair
 * both localisers key their per-service statistics on. This map was keyed on the metric name, which
 * meant a case could declare one quantity on two entities (a partition's two halves, each reporting
 * its own member count) and the second would silently overwrite the first (finding 323).
 *
 * `\u0000` rather than a printable separator because a service name may contain any punctuation a
 * `|`, `/` or `.` would collide with, and two keys that collide is the defect this replaced.
 */
function readingKey(one) {
  return `${String(one?.service ?? '')}\u0000${String(one?.metric ?? '')}`;
}

/**
 * Every layer's annotation must show the sentence it came from.
 *
 * `why` is prose and cannot be checked; a quote can. The annotations in this directory are made
 * by reading an incident text and writing four layers from it, so the one property a machine can
 * hold them to is that the words they lean on are in the text -- an annotator who paraphrases the
 * source from memory produces a quote that is not there, and the case then rests on a sentence
 * nobody wrote.
 */
function sourceProblems(entry, sample, caseId) {
  const sources = entry?.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    return [`'${caseId}' cites no sources; each of the four layers must quote the sentence it rests on`];
  }
  const problems = [];
  const covered = new Set();
  const text = fold(sample?.incidentText);
  for (const source of sources) {
    const layer = typeof source?.layer === 'string' ? source.layer : '';
    const quote = typeof source?.quote === 'string' ? source.quote : '';
    const why = typeof source?.why === 'string' ? source.why : '';
    if (!LAYERS.includes(layer)) {
      problems.push(`'${caseId}' has a source with layer '${layer}', which is not one of ${LAYERS.join(' / ')}`);
      continue;
    }
    covered.add(layer);
    if (quote.length < MIN_QUOTE) {
      problems.push(`'${caseId}' has a ${layer} quote shorter than ${String(MIN_QUOTE)} characters: '${quote}'`);
      continue;
    }
    if (why.length < 20) {
      problems.push(`'${caseId}' quotes for ${layer} without saying what it supports`);
    }
    if (!text.includes(fold(quote))) {
      problems.push(
        `'${caseId}' cites a ${layer} quote the incident text does not contain: '${quote}'. ` +
          'Paraphrasing the source from memory produces this, and the case would then rest on a sentence nobody wrote.',
      );
    }
  }
  const missing = LAYERS.filter((layer) => !covered.has(layer));
  if (missing.length > 0) {
    problems.push(`'${caseId}' quotes no sentence for: ${missing.join(', ')}`);
  }
  return problems;
}
const floor = typeof index.min === 'number' ? index.min : 0;

const problems = [];
const invalid = [];
const seen = new Set();

// Whether the index covers the samples, which is not the same question as whether it is as long as
// them. The sentence this guard prints -- `n of m sample(s) carry a four-layer case` -- takes its
// numerator from the index's length and its denominator from the extraction key, and nothing
// compared the two sets until `fault/sample-coverage.ts` existed. At the corpus's target the two
// numbers agree by construction, so a sample annotated twice leaves another unannotated while the
// report says the set is complete (finding 302).
//
// Asked once, before the loop, because coverage is a property of the index rather than of any
// entry: a duplicate belongs to two entries and neither of them owns the defect.
for (const problem of core.checkSampleCoverage({
  entries: index.cases.map((entry) => ({
    caseId: String(entry?.caseId ?? ''),
    sampleId: String(entry?.sampleId ?? ''),
  })),
  knownSampleIds: [...known],
})) {
  problems.push(problem);
}
/** Cases whose derived telemetry passed G1's signal rules and G3. Reported, not gated. */
const withTelemetry = [];
/** What the checkpoints of every annotated case claim about the signals it declares. */
/**
 * How much of what a case declares about itself anything actually reads.
 *
 * `fault.parameters` holds the case's own facts -- the loss rate, the heap limit, the retention gap
 * -- and a reading may cite one with `{ parameter: 'name' }` so that the number in the series and
 * the number in the injection spec cannot drift apart (finding 258). The mechanism existed and
 * almost nothing used it: of the ninety-odd keys this corpus declares, most were written and never
 * read, which is the shape this volume has spent its rounds deleting from code.
 *
 * The count alone was the whole rule for eight rounds, because nothing in the file said which keys
 * were descriptive and which were forgotten (finding 300). The file says so now: an uncited key
 * carries a sentence in `fault.parameterNotes`, and `fault/parameter-notes.ts` refuses a case whose
 * note is missing, misplaced or a label. What is printed here is the share that is still measured
 * rather than gated -- how much of the annotation a reading speaks for, and how short the shortest
 * note is.
 */
const parameterUse = { declared: 0, referenced: 0, noted: 0, cases: 0, shortest: 0 };

/**
 * What each case says about the reading that ranks it.
 *
 * `main.py` decides the ranking series from the *path* -- it recognises a corpus token and looks for
 * a column named `{service}_latency` -- so a corpus that never says which of its readings moved
 * leaves the consumer to guess, and a corpus that publishes a share under a `_latency` name hands it
 * a number about a different quantity. Each case answers one way or the other, and the two counts are
 * printed on both exits (finding 331).
 */
const sliUse = { declared: 0, none: 0 };
/**
 * What each case says about the two modalities it can show.
 *
 * `logs` and `traces` are lists, so a case with no line and a case nobody filled in were the same
 * bytes: 19 of 30 declared no log line and 25 no span, and the readout published those as facts about
 * the incidents. Each case now answers both ways -- it shows the modality or it writes why it cannot
 * (`noLogs` / `noTraces`, read by `fault/modality-evidence.ts`) -- and the split is printed on both
 * exits, so "the incident left no line" and "nobody wrote one" stop being the same number.
 *
 * The second reading is the half a machine can check: a case whose chain crosses a `calls` edge has
 * an exchange a span pair could describe, so a case that has no span *and* crosses a call is the one
 * whose reason is doing real work. The count is a reading rather than a gate, because the missing
 * half is a judgement: the text of five of those cases quotes no duration for the exchange, and
 * refusing them for it would be refusing an annotation that is correct.
 */
const modalityUse = {
  log: { shown: 0, absent: 0, refused: 0 },
  trace: { shown: 0, absent: 0, refused: 0 },
  /** Cases that carry no span at all, whatever they said about it. */
  withoutTraces: 0,
  /** Cases with no span whose causal chain still crosses a service call, by case id. */
  crossingWithoutSpan: [],
};
const checkpointRefs = {
  total: 0,
  resolved: 0,
  resolvedAny: 0,
  /** Series checkpoints whose entity is the very one carrying the reading. */
  byEntity: 0,
  /** Series checkpoints that resolved through containment: the reading is a component away. */
  byComponent: 0,
  derived: 0,
  derivedRefs: 0,
  configuration: 0,
  logLines: 0,
  logHolds: 0,
  inequalities: 0,
  false: 0,
};
/**
 * How much of the corpus's evidence the causal chain actually uses.
 *
 * `total` is every stated checkpoint; `cited` is the ones at least one step names. The two are
 * equal when the corpus is right, which is why the pair is printed rather than a defect count: a
 * separate line saying "0 uncited" would be a constant zero -- a number no run can move -- while
 * "120 of 120" is a fraction whose denominator grows with the corpus and whose numerator is what a
 * new annotation can lower. Nine were uncited before this was measured, in nine cases, and six of
 * the nine were the control that rules out the competing hypothesis: the health check that never
 * failed, the client pool that never filled, the handler time the fault did not change. Two of the
 * three exports build their evidence list from `CausalStep.evidenceRefs`, so those nine facts
 * reached one target and no other.
 */
const citedEvidence = { total: 0, cited: 0 };
/**
 * Cases that state a difficulty level.
 *
 * Counted because the corpus exports every case without one as `medium` -- the exporter's
 * documented `unset -> medium` arm -- so "unannotated" and "measured as medium" look identical in
 * the output. The distribution rule below needs ten graded cases before it says anything, and the
 * count is printed so that "the rule did not apply" is visible rather than inferred from silence.
 */
const gradedCases = [];
/** The spread of declared levels, once the corpus has been read. Null when the rule does not apply. */
let difficultySpread = null;
/**
 * Where each baseline placed the answer, and how wide the ranking it placed it in was.
 *
 * Reported rather than gated, and it is the number the corpus's difficulty argument turns on: a
 * metric baseline that is right at rank 1 in every case is telling us the cases are one moving
 * series among quiet ones, which is what they are. Before the background existed this could not be
 * said at all, because a ranking of two scored at top-3 is right by construction.
 */
const localisation = [];
/** Every baseline run, for the corpus-level question about whether any of them can be wrong. */
const localisationRuns = [];
/**
 * Every case that parsed, whether or not it carries telemetry.
 *
 * The distribution of levels is a property of the annotations, and a case with no derived signals
 * is still annotated -- so this is the population the rule is about. An earlier draft filled the
 * list only for cases that reached `withTelemetry`, which made the rule depend on a second,
 * unrelated measurement.
 */
const allCases = [];
/** The same telemetry, in the shape an exporter reads: cases and the signals attached to them. */
const telemetryCases = [];
const telemetrySignals = {};
let firstGraph = null;
/**
 * The graph contract, per graph file.
 *
 * The graph's obligations belong to the graph, not to the case that happens to be read when the
 * loop reaches it: thirteen cases ship one topology, and reporting a defect of that topology once
 * per case says "thirteen defects" to a reader who has one edge to repair. Keyed on the file name
 * rather than on `firstGraph`, so a corpus that grows a second topology still checks both.
 */
const graphContracts = new Map();

/**
 * The system's background traffic, one quiet series per service.
 *
 * A case's own signals file carries the series its incident is about, and every number there has to
 * quote a sentence of the ticket. That rule is what keeps an annotation honest, and it is also what
 * capped every ranking at the two or three services the story names: a ranking of two scored at
 * top-3 cannot be missed, so fifteen cases reported fifteen top-3 hits and the claim was measured by
 * nothing (finding 275).
 *
 * This file is the other half of the telemetry -- the whole storefront at its ordinary request
 * rates, flat through every case's window. It asserts nothing about any incident, which is why none
 * of it quotes a text and why no checkpoint may cite one of these series: the checkpoint resolver
 * reads the case's own declarations only, so a reference to `request_rate` fails with the list of
 * what the case actually says.
 */
const BACKGROUND_FILE = 'background-telemetry.json';
const background = loadBackground(args.cases);
let backgroundChecked = false;

function loadBackground(casesDir) {
  const path = join(casesDir, BACKGROUND_FILE);
  if (!existsSync(path)) {
    problems.push(
      `the corpus at '${casesDir}' declares no ${BACKGROUND_FILE}: without it a case's ranking holds ` +
        'only the services its own ticket names, and being within the top-K is then true of any answer',
    );
    return { series: [] };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    problems.push(`'${path}' is not readable JSON: ${String(error?.message ?? error)}`);
    return { series: [] };
  }
  // The rules live in `fault/background.ts` so that they are unit-tested rather than only exercised
  // through this script: schema, the reason, one entry per (service, metric), numeric values.
  const parsed = core.parseBackground(raw);
  if ('problems' in parsed) {
    for (const problem of parsed.problems) problems.push(`'${BACKGROUND_FILE}' ${problem}`);
    return { series: [] };
  }
  return parsed.declaration;
}

/**
 * The background is the whole system, or the numbers mean something else.
 *
 * Both directions are checked, and each failure means something different: an entry the graph does
 * not hold is a series attributed to nothing, and a service the background omits is a candidate the
 * ranking silently leaves out. Run once, on the first case's graph, because the corpus ships one.
 */
function checkBackgroundAgainst(graph) {
  for (const problem of core.backgroundProblems(background, graph)) {
    problems.push(`'${BACKGROUND_FILE}' ${problem}`);
  }
}

for (const entry of index.cases) {
  const caseId = typeof entry?.caseId === 'string' ? entry.caseId : '';
  if (caseId === '') {
    problems.push('an entry in the index has no caseId');
    continue;
  }
  if (seen.has(caseId)) {
    problems.push(`'${caseId}' appears twice in the index; two annotations of one case is an ambiguity, not coverage`);
    continue;
  }
  seen.add(caseId);

  // The link back to the extraction key. Without it the count is a number about a directory.
  const sampleId = typeof entry.sampleId === 'string' ? entry.sampleId : '';
  if (sampleId === '' || !known.has(sampleId)) {
    problems.push(`'${caseId}' names sample '${sampleId}', which the extraction key does not carry`);
    continue;
  }
  if (typeof entry.why !== 'string' || entry.why.length < 40) {
    // The `why` is the annotation's argument: which parts of the text each layer came from.
    // A case added without it is a case nobody can review.
    problems.push(`'${caseId}' does not say in at least forty characters where the annotation came from`);
  }
  // A `for` loop rather than `push(...)`: the list is one entry per source, so its length is a
  // function of the annotation and `no-size-dependent-array-is-spread` refused the spread. It was
  // right to -- four sources today, and the rule exists because the argument limit is reached by
  // a big enough input rather than by a different code path.
  for (const problem of sourceProblems(entry, sampleById.get(sampleId), caseId)) {
    problems.push(problem);
  }

  const rawCase = readJson(join(args.cases, String(entry.case)), `case file for '${caseId}'`);
  const rawGraph = readJson(join(args.cases, String(entry.graph)), `graph for '${caseId}'`);

  let parsedCase;
  let parsedGraph;
  try {
    parsedCase = core.faultCaseSchema.parse(rawCase);
    parsedGraph = core.entityGraphSchema.parse(rawGraph);
  } catch (error) {
    // A case that does not parse is an unreadable input, not a case with an empty layer: the
    // two call for different repairs, so they get different exit codes. The message is composed by
    // `describeSchemaFailure`, because `String(error.message).split('\n')[0]` is `[` for a zod issue
    // list -- every refusal used to be reported as the case id and a bracket.
    invalid.push(`'${caseId}' does not parse: ${core.describeSchemaFailure(error)}`);
    continue;
  }

  // The two halves of the corpus, compared. `sampleId` joined an extraction key to a four-layer
  // annotation and nothing looked at both sides of the join: the key states the fault's type, its
  // category and the component a solver has to name, and the annotation states them again from the
  // text. Ten cases agreed on all three by habit rather than by rule, and a disagreement would leave
  // the benchmark scoring an answer the key does not ask for (finding 255).
  //
  // The component is the one that matters most -- it is the answer -- but the three are checked
  // together because they are one claim about one incident, and a rule that covered only the answer
  // would let the case be filed under a category its own key does not use.
  allCases.push(parsedCase);
  if (parsedCase.difficulty !== undefined) gradedCases.push(parsedCase.caseId);
  // The graph bounds every case that ships it, so the first parsed case is enough to answer the
  // set-level questions below. It used to be recorded inside the telemetry block, which made "the
  // corpus has a graph" depend on "some case derived signals".
  if (firstGraph === null) firstGraph = parsedGraph;

  const expected = sampleById.get(sampleId)?.expected ?? {};
  const agrees = [
    ['fault type', parsedCase.fault.type, expected.type],
    ['category', parsedCase.fault.category, expected.category],
    ['root cause component', parsedCase.groundTruth.rootCauseComponent, expected.component],
  ];
  for (const [what, declared, fromKey] of agrees) {
    if (typeof fromKey !== 'string' || fromKey === '') continue;
    if (declared === fromKey) continue;
    problems.push(
      `'${caseId}' declares ${what} '${String(declared)}', and the sample it is annotated from ` +
        `expects '${fromKey}'`,
    );
  }

  // The case's own L2 contract, which nothing had ever run against this corpus. `assessFourLayer`
  // answers "are the four layers filled"; it does not answer "is this a well-formed case", and a
  // case can be four-layer complete with a timestamp that is not canonical UTC or a window that
  // does not contain its own onset. G1 is the gate that asks, and it needs no telemetry for the
  // structural half -- so the annotation carries the obligation without carrying signals.
  const bundle = { irVersion: '1.0.0', graph: parsedGraph, cases: [parsedCase], signals: {} };
  const structural = core.checkG1Structural(bundle, { requiredSignals: [], requiresQuery: false });
  for (const violation of structural.violations) {
    problems.push(`'${caseId}' fails the L2 structural contract: ${violation.message}`);
  }

  // G2 is the other half of L2: every entity reference resolves, a causal hop exists in the
  // topology, an onset sits inside its window, and a numeric checkpoint's unit exists in the
  // conversion table. The last one is what found this: `m`, `messages` and `x` are the units a
  // person writes and none of them is in the table, so three checkpoints across two cases had
  // been carrying values no conversion could ever be asked to perform.
  // The graph half, once per file. `checkCaseSemantics` below is the case half: G2 composes the
  // two, and asking it here per case would run the graph's three loops once per case.
  const graphKey = String(entry.graph);
  if (!graphContracts.has(graphKey)) {
    const contract = core.checkGraphContract(parsedGraph);
    graphContracts.set(graphKey, contract);
    for (const violation of contract.violations) {
      problems.push(`graph '${graphKey}' fails the L2 reference contract: ${violation.message}`);
    }
  }

  const semantic = core.checkCaseSemantics(bundle);
  for (const violation of semantic.violations) {
    problems.push(`'${caseId}' fails the L2 reference contract: ${violation.message}`);
  }

  // G5 needs no telemetry either, so it is asked of every case: a body that carries an email
  // address or a token is a corpus defect regardless of whether the case can be scored yet, and
  // `answerKeyIsolated` is a claim the case makes about itself that nothing had checked.
  const antiPollution = core.checkG5AntiPollution(bundle, { requireAnswerKeyIsolation: true });
  for (const violation of antiPollution.violations) {
    problems.push(`'${caseId}' fails the anti-pollution gate: ${violation.message}`);
  }

  // Derived telemetry, when the entry declares it. This is the step that changes what the corpus
  // *is*: without signals a case is an annotation, and with them it is something G1's signal rules,
  // G2's window rule and G3's anomaly rule can all be pointed at. It is still not scoreable -- G4
  // needs a baseline solver and G5 needs the pollution checks -- and the report says "derived" so
  // that no reader mistakes a constructed series for a captured one.
  if (typeof entry.signals === 'string') {
    const declaration = readJson(join(args.cases, entry.signals), `signals for '${caseId}'`);
    if (declaration.caseId !== caseId) {
      problems.push(`'${caseId}' names signals for '${String(declaration.caseId)}'`);
    }
    // The one claim a reader must be able to trust at a glance: were these signals taken from a
    // deployment, or constructed from the annotation? A closed vocabulary is what makes it
    // checkable -- a free string would let a future case say anything that reads well, and the
    // whole report says "derived" on the strength of this field.
    //
    // The field is `origin`, not `provenance`, and the reason is that this repository already
    // publishes a `provenance`: `PROVENANCE_SOURCES` in `ir/types.ts` is a four-member per-field
    // vocabulary (`direct | derived | inferred | defaulted`) describing how an individual value was
    // obtained. Overloading the word for a two-member axis about a whole series would make
    // `derived` mean "computed from other values" in one file and "constructed from prose" in
    // another, and `captured` is not a member of the published set at all. Two vocabularies with one
    // name is how a reader greps for a word and gets two answers.
    if (declaration.origin !== 'derived' && declaration.origin !== 'captured') {
      problems.push(
        `'${caseId}' declares origin '${String(declaration.origin)}', which is neither ` +
          "'derived' nor 'captured'",
      );
    }
    if ('provenance' in declaration) {
      // The old name, refused rather than ignored: a declaration that still says `provenance` would
      // otherwise be read as having no origin at all, and the guard would report a vocabulary error
      // about an empty string instead of about the field that has to move.
      problems.push(
        `'${caseId}' declares 'provenance'; the signals field is 'origin', because this repository ` +
          'already publishes a different `provenance` (`PROVENANCE_SOURCES`)',
      );
    }
    const text = fold(sampleById.get(sampleId)?.incidentText);
    // Stated once, here, because two rules below expand the same declaration: the telemetry a solver
    // is given, and the grid check that reads the samples. A second `expansionTime` call would be a
    // second chance for the two to disagree about the window.
    const when = expansionTime(parsedCase);
    const series = Array.isArray(declaration.series) ? declaration.series : [];
    if (series.length === 0) {
      problems.push(`'${caseId}' declares an empty signal series`);
    }
    // The case's own statements about how the system was configured. A configuration checkpoint cites
    // one of these instead of naming a metric-shaped string that nothing resolves: the rule used to be
    // negative ("must not collide with a series"), which caught a modelling error and said nothing
    // about whether the fact was the one the case ran under (finding 247).
    const parameters = typeof rawCase?.fault?.parameters === 'object' && rawCase.fault.parameters !== null
      ? rawCase.fault.parameters
      : {};
    const parameterKeys = Object.keys(parameters);
    parameterUse.declared += parameterKeys.length;
    if (parameterKeys.length > 0) parameterUse.cases += 1;
    /** The keys a reading in this case cites, by either route: a series point or a configuration. */
    const citedParameters = new Set();
    // A reading may be a literal or a reference to a quantity the case declares about itself. The
    // resolution happens once, here, and everything downstream -- the range check, the expansion, the
    // expression evaluator, the checkpoint comparison -- reads the hash rather than the file. The
    // alternative was two numbers that stay in step by being edited together, which is how a pool
    // ceiling becomes a reading that disagrees with its own parameter (finding 258).
    const resolvedReadings = new Map();
    for (const one of series) {
      const metric = String(one?.metric);
      const points = {};
      for (const point of core.SERIES_POINTS) {
        const resolution = core.readDeclaredReading(one?.[point]);
        if (resolution === undefined) {
          problems.push(
            `'${caseId}' declares ${point} '${JSON.stringify(one?.[point])}' for '${metric}', which is ` +
              'neither a number nor a { parameter } reference',
          );
          continue;
        }
        if (resolution.kind === 'literal') {
          points[point] = resolution.value;
          continue;
        }
        const parameterName = resolution.parameter;
        citedParameters.add(parameterName);
        if (!Object.hasOwn(parameters, parameterName)) {
          problems.push(
            `'${caseId}' declares ${point} as parameter '${parameterName}' for '${metric}', and ` +
              `fault.parameters declares no such key (it declares: ${parameterKeys.join(', ') || 'nothing'})`,
          );
          continue;
        }
        const quantity = core.readDeclaredQuantity(parameters[parameterName]);
        if (quantity === undefined) {
          problems.push(
            `'${caseId}' declares ${point} as parameter '${parameterName}' for '${metric}', whose value ` +
              `${JSON.stringify(parameters[parameterName])} is not a number or a { value, unit } quantity`,
          );
          continue;
        }
        // The unit has to agree, or be convertible into the series' unit: a reading in `ms` that
        // cites a parameter declared in `count` is a comparison nobody can make.
        const seriesUnit = typeof one?.unit === 'string' ? one.unit : undefined;
        if (quantity.unit !== undefined && seriesUnit !== undefined && quantity.unit !== seriesUnit) {
          if (!core.isConvertible(quantity.unit, seriesUnit)) {
            problems.push(
              `'${caseId}' declares ${point} for '${metric}' in '${seriesUnit}', and parameter ` +
                `'${parameterName}' is declared in '${quantity.unit}', which is not convertible`,
            );
            continue;
          }
          points[point] = core.convertUnit(quantity.value, quantity.unit, seriesUnit);
          continue;
        }
        if (quantity.unit !== undefined && seriesUnit === undefined) {
          problems.push(
            `'${caseId}' declares ${point} for '${metric}' with no unit, and parameter ` +
              `'${parameterName}' is declared in '${quantity.unit}'`,
          );
          continue;
        }
        points[point] = quantity.value;
      }
      resolvedReadings.set(readingKey(one), points);
    }

    for (const one of series) {
      const quote = typeof one?.quote === 'string' ? one.quote : '';
      if (!text.includes(fold(quote))) {
        problems.push(
          `'${caseId}' derives '${String(one?.metric)}' from a quote the incident text does not contain: '${quote}'`,
        );
      }
      // The shape of the derived series is part of what the case claims, so an unknown shape is a
      // refusal rather than a fallback to `step`. The first version had the fallback, and a typo
      // would have produced a series nobody wrote and no reading of the file would reveal.
      const derivation = one?.derivation === undefined ? 'step' : one.derivation;
      if (!DERIVATIONS.includes(derivation)) {
        problems.push(
          `'${caseId}' declares derivation '${String(derivation)}' for '${String(one?.metric)}', ` +
            `which is not one of ${DERIVATIONS.join(' / ')}`,
        );
      }
      // Whether the reading is exact. `noise` decides that, so an unknown member is refused rather
      // than read as the default -- and a counter refuses the field outright, because a counter's
      // samples are its accumulation and are exact whichever way the field is set (finding 254).
      if (one?.noise !== undefined) {
        if (!NOISE.includes(one.noise)) {
          problems.push(
            `'${caseId}' declares noise '${String(one.noise)}' for '${String(one?.metric)}', ` +
              `which is not one of ${NOISE.join(' / ')}`,
          );
        } else if (derivation === 'counter') {
          problems.push(
            `'${caseId}' declares noise for '${String(one?.metric)}', which is a counter -- its samples ` +
              'are exact either way, so the field would claim a distinction the shape does not have',
          );
        }
      }
      // A reading has to be a value its unit admits. The expansion clamps the *noise* into the unit's
      // range, and this is the other half: the number the annotation states is the author's, and a
      // share of 120 % in `%` is not a noisy measurement, it is a number no measurement can be. The
      // bound comes from `util/unit.ts`, so a unit with no stated ceiling (`ms`, `count`) has none
      // here either -- inventing one would be this rule doing exactly what it exists to prevent
      // (finding 252).
      const bounds = typeof one?.unit === 'string' ? core.measurementBounds(one.unit) : undefined;
      if (bounds !== undefined) {
        // `[0, 1]` when the ceiling is a number and `[0, ∞)` when it is not: a closed bracket on an
        // infinite bound would be a claim that the range ends somewhere.
        const unbounded = bounds.max === Number.POSITIVE_INFINITY;
        const range = `[${String(bounds.min)}, ${unbounded ? '∞)' : `${String(bounds.max)}]`}`;
        for (const point of core.SERIES_POINTS) {
          const value = resolvedReadings.get(readingKey(one))?.[point];
          if (typeof value !== 'number') continue;
          if (value < bounds.min || value > bounds.max) {
            problems.push(
              `'${caseId}' declares ${point} ${String(value)} for '${String(one?.metric)}' in ` +
                `'${one.unit}', and a reading in '${one.unit}' lies in ${range}`,
            );
          }
        }
      }
      // The other side of the grid: the number an author writes is a reading too, and it is not the
      // same rule as the samples below. The expansion can round a sample, and it must not round the
      // declared post -- a counter's last sample is required to *be* that number, so a declaration of
      // 201.5 things would either break the invariant or move the reading the file states.
      if (typeof one?.unit === 'string' && !core.admitsFraction(one.unit)) {
        for (const point of core.SERIES_POINTS) {
          const value = resolvedReadings.get(readingKey(one))?.[point];
          if (typeof value !== 'number' || Number.isInteger(value)) continue;
          problems.push(
            `'${caseId}' declares ${point} ${String(value)} for '${String(one?.metric)}' in ` +
              `'${one.unit}', and a count lands on whole things -- the expansion would have to ` +
              'round the number the file states',
          );
        }
      }
      // The samples are not checked here, deliberately. `expandSeries` is the only producer of them and
      // `derived-telemetry.test.ts` pins its output to sixteen written-out numbers, so a second rule
      // that expanded the declaration again would be comparing the arithmetic with itself -- and it
      // would be unreachable, because the expansion quantizes before any caller can see a fraction.
      // A gate that no input can fail is a gate a reader learns to skip; finding 285 records the first
      // version of this rule, which was exactly that.
    }
    const logs = Array.isArray(declaration.logs) ? declaration.logs : [];
    for (const one of logs) {
      const quote = typeof one?.quote === 'string' ? one.quote : '';
      const body = typeof one?.body === 'string' ? one.body : '';
      if (!text.includes(fold(quote))) {
        problems.push(
          `'${caseId}' derives a log line from a quote the incident text does not contain: '${quote}'`,
        );
      }
      if (body.length < 12) {
        problems.push(`'${caseId}' declares a log body shorter than twelve characters: '${body}'`);
      }
      if (typeof one?.why !== 'string' || one.why.length < 20) {
        problems.push(`'${caseId}' declares a log line without saying what it supports`);
      }
    }

    // Whose line it is. The phrase check above compares a checkpoint with the body it cites, and the
    // four-layer assessment resolves the entity it names -- and nothing compared the two, so a
    // checkpoint could cite a line written by a component its own case never touches and pass both
    // (finding 293). The rule is containment rather than equality: a pod's checkpoint may cite a
    // line its container wrote, and three of the corpus's seven log checkpoints are two shapes of
    // exactly that -- two name a container whose line names the service, one names a pod whose line
    // names a container. The other four agree on the name, and a rule built on that agreement would
    // be right four times and wrong the fifth.
    for (const problem of core.checkLogAttribution({ graph: parsedGraph, case: parsedCase, logs })) {
      problems.push(`'${caseId}' ${problem}`);
    }

    const traces = Array.isArray(declaration.traces) ? declaration.traces : [];
    const spanNames = new Set(traces.map((one) => String(one?.spanName)));
    for (const one of traces) {
      const quote = typeof one?.quote === 'string' ? one.quote : '';
      if (!text.includes(fold(quote))) {
        problems.push(`'${caseId}' derives a span from a quote the incident text does not contain: '${quote}'`);
      }
      const duration = Number(one?.durationMs);
      if (!Number.isFinite(duration) || duration <= 0) {
        problems.push(`'${caseId}' declares span '${String(one?.spanName)}' with a duration of ${String(one?.durationMs)}`);
      }
      if (typeof one?.why !== 'string' || one.why.length < 20) {
        problems.push(`'${caseId}' declares a span without saying what it supports`);
      }
      if (typeof one?.parent === 'string' && !spanNames.has(one.parent)) {
        problems.push(
          `'${caseId}' declares span '${String(one?.spanName)}' whose parent '${one.parent}' is not declared in the same file`,
        );
      }
    }

    // What the case says about the two modalities it does not show. `logs` and `traces` are lists, so
    // an absent one used to read exactly like an unfilled one; the fields below are the answer, and
    // the three properties a guard can decide -- is it there, is it alone, is it a sentence -- are
    // decided in `fault/modality-evidence.ts` rather than here (finding 334).
    for (const modality of core.EVIDENCE_MODALITIES) {
      const read = core.readModalityAnswer({
        modality,
        declared: modality === 'log' ? declaration.logs : declaration.traces,
        reason: modality === 'log' ? declaration.noLogs : declaration.noTraces,
      });
      if (read.fault !== null) {
        problems.push(core.describeModalityFault(read.fault, caseId));
        modalityUse[modality].refused += 1;
        continue;
      }
      if (read.answer.declared > 0) modalityUse[modality].shown += 1;
      else modalityUse[modality].absent += 1;
    }
    // Counted whether or not the answer was readable, because the reading below is about the corpus
    // rather than about the cases that passed: `6 of the 0 case(s)` is what a count that only sees
    // the answers prints when the answers are the thing that is missing.
    if (!Array.isArray(declaration.traces) || declaration.traces.length === 0) {
      modalityUse.withoutTraces += 1;
      const crossings = core.callsAcrossChain({ steps: parsedCase.groundTruth.causalChain, graph: parsedGraph });
      if (crossings.length > 0) modalityUse.crossingWithoutSpan.push(caseId);
    }

    // What each checkpoint's reference is a reference *to*, and whether it resolves.
    //
    // `signalRef` was one optional string carrying four different things, and nothing resolved it:
    // eight of eleven named a series that did not exist (finding 243). `signalKind` says which kind,
    // and each kind has its own rule, because a rule that treated them alike would be wrong for at
    // least one of them.
    const seriesByPair = new Map();
    const seriesByMetric = new Map();
    for (const one of series) {
      const metric = String(one?.metric);
      const key = readingKey(one);
      // Two declarations of one *pair*: a reference resolves to whichever came second, and nothing in
      // the file says which of them the checkpoint meant. Reported because the resolution that
      // follows would otherwise be a coin toss the guard does not know it is making.
      //
      // One metric on two entities is not that defect, and until this round the rule could not tell
      // the two apart: it keyed on the name, so a case could not say "the members each side sees" at
      // all (finding 299). It can now, and the ambiguity that creates is resolved where the entity is
      // known -- at the checkpoint, by `resolveReading`.
      if (seriesByPair.has(key)) {
        problems.push(
          `'${caseId}' declares two series for '${metric}' on '${String(one?.service ?? '')}', ` +
            'so a reference to either names neither',
        );
        continue;
      }
      seriesByPair.set(key, one);
      const bucket = seriesByMetric.get(metric);
      if (bucket === undefined) seriesByMetric.set(metric, [one]);
      else bucket.push(one);
    }
    // Whether the answer is a name the telemetry can score (finding 298).
    //
    // The ranking finds the root cause by exact match on a series' `service`, and nothing joined the
    // two. The round that annotated this corpus's twenty-fifth case filed every reading under the pod
    // -- where a heap lives -- and left the service with one flat series; both baselines reported
    // `absent` and G4 said "no baseline can locate the root cause", which is a sentence about solvers
    // for a defect in the annotation. Asked here, the report names the component and the names the
    // file actually carries.
    for (const problem of core.checkAnswerPresence({
      case: parsedCase,
      seriesServices: series.map((one) => String(one?.service ?? '')),
    })) {
      problems.push(`'${caseId}' ${problem}`);
    }

    // The same series in the shape the expression evaluator reads, with every point in
    // `SERIES_POINTS` read through the tuple -- so a third point needs an edit in one place.
    const expressionSeries = series.map((one) => ({
      // The carrier travels with the metric: an expression over a quantity two entities report has
      // to be able to say which, and `cluster_members_visible@node-4.post` is how (`finding 324`).
      entity: String(one?.service ?? ''),
      metric: String(one?.metric),
      unit: typeof one?.unit === 'string' ? one.unit : '',
      points: resolvedReadings.get(readingKey(one)) ?? {},
    }));
    const logIds = new Set();
    const logBodies = new Map();
    for (const one of logs) {
      const id = typeof one?.id === 'string' ? one.id : '';
      if (id === '') {
        problems.push(`'${caseId}' declares a log line with no id, which nothing can reference`);
        continue;
      }
      if (logIds.has(id)) problems.push(`'${caseId}' declares two log lines with id '${id}'`);
      logIds.add(id);
      logBodies.set(id, typeof one?.body === 'string' ? one.body : '');
    }

    for (const checkpoint of parsedCase.groundTruth.evidenceCheckpoints ?? []) {
      const id = checkpoint.checkpointId;
      const kind = checkpoint.signalKind ?? 'series';
      checkpointRefs.total += 1;

      // A derived checkpoint states arithmetic, and the arithmetic is what gets evaluated: the number
      // is a consequence of the expression rather than a second claim standing beside it. Before
      // finding 245 it carried one `signalRef` and the computation lived only in the value, so `== 3`
      // over a series whose post is `0.06` could not be checked at all -- and two checkpoints could
      // state different arithmetic over the same series and nothing would disagree.
      if (kind === 'derived') {
        const text = typeof checkpoint.expression === 'string' ? checkpoint.expression : '';
        const outcome = core.evaluateExpression(text, expressionSeries);
        if (!outcome.ok) {
          problems.push(
            `'${caseId}' checkpoint '${id}' has an expression that ` +
              `${core.describeExpressionProblem(outcome.problem)} -- '${text}'`,
          );
          continue;
        }
        checkpointRefs.resolved += 1;
        checkpointRefs.resolvedAny += 1;
        checkpointRefs.derived += 1;
        checkpointRefs.derivedRefs += outcome.value.references.length;
        if (checkpoint.unit !== outcome.value.unit) {
          problems.push(
            `'${caseId}' checkpoint '${id}' computes '${text}' to a value in '${outcome.value.unit}', ` +
              `but states '${String(checkpoint.unit)}'`,
          );
          continue;
        }
        if (typeof checkpoint.value !== 'number') {
          problems.push(
            `'${caseId}' checkpoint '${id}' computes '${text}' to a number, but states ` +
              `'${String(checkpoint.value)}' beside it`,
          );
          continue;
        }
        if (!core.isNumericComparator(checkpoint.comparator)) {
          problems.push(
            `'${caseId}' checkpoint '${id}' compares a computed number with ` +
              `'${String(checkpoint.comparator)}', which does not order two numbers`,
          );
          continue;
        }
        checkpointRefs.inequalities += 1;
        // With the tolerance `fault/expression.ts` documents: `0.06 / 0.02` is `2.9999999999999996`,
        // and an exact `==` would have refused the annotation that is right.
        if (!core.holdsWithTolerance(checkpoint.comparator, outcome.value.value, checkpoint.value)) {
          checkpointRefs.false += 1;
          problems.push(
            `'${caseId}' checkpoint '${id}' asserts '${text}' ${checkpoint.comparator} ` +
              `${String(checkpoint.value)}, and it computes to ${displayNumber(outcome.value.value)}`,
          );
        }
        continue;
      }

      const ref = typeof checkpoint.signalRef === 'string' ? checkpoint.signalRef : '';
      if (ref === '') {
        problems.push(`'${caseId}' checkpoint '${id}' names no signal, so nothing carries it`);
        continue;
      }
      if (kind === 'log') {
        // A log checkpoint is the only one whose assertion is about a *string*, and until this round
        // the guard stopped at "the id resolves". Three of the shipped corpus's four log
        // checkpoints were true and the fourth was not -- it cited "segmentation fault" while the
        // line it named said `SIGSEGV` -- and nothing in the repository read the body, so the claim
        // and the reconstruction were two statements that never met. A log line has no magnitude, no
        // unit and no order, so the one relation it can be asked about is containment, and the check
        // is that the phrase is in the text the case itself wrote (finding 286).
        if (!logIds.has(ref)) {
          problems.push(`'${caseId}' checkpoint '${id}' names log '${ref}', which the signals file does not declare (it declares: ${[...logIds].join(', ') || 'none'})`);
          continue;
        }
        checkpointRefs.resolvedAny += 1;
        checkpointRefs.logLines += 1;
        if (checkpoint.comparator !== 'contains') {
          problems.push(
            `'${caseId}' checkpoint '${id}' compares a log line with '${String(checkpoint.comparator)}', ` +
              'and a log has one relation: whether it contains the phrase the checkpoint cites',
          );
          continue;
        }
        const phrase = typeof checkpoint.value === 'string' ? checkpoint.value : '';
        if (phrase === '') {
          problems.push(
            `'${caseId}' checkpoint '${id}' states ${JSON.stringify(checkpoint.value)} as the phrase to ` +
              `find in log '${ref}', which is not a non-empty string`,
          );
          continue;
        }
        const body = logBodies.get(ref) ?? '';
        if (!body.includes(phrase)) {
          problems.push(
            `'${caseId}' checkpoint '${id}' asserts log '${ref}' contains '${phrase}', and the line it ` +
              `cites does not (it reads: '${body}')`,
          );
          continue;
        }
        checkpointRefs.logHolds += 1;
        continue;
      }
      if (kind === 'configuration') {
        // Two rules, and they are different rules. A configuration fact that is also a series is a
        // modelling error -- two statements of one value, one of which the guard would compare against
        // telemetry. And the fact has to *be a fact the case declares*: `signalRef` names a key of
        // `fault.parameters`, and the comparison is against what that key holds.
        if (seriesByMetric.has(ref)) {
          problems.push(`'${caseId}' checkpoint '${id}' calls '${ref}' a configuration fact, but the signals file declares a series by that name`);
          continue;
        }
        if (!Object.hasOwn(parameters, ref)) {
          problems.push(
            `'${caseId}' checkpoint '${id}' calls '${ref}' a configuration fact, but fault.parameters ` +
              `declares no such key (it declares: ${parameterKeys.join(', ') || 'nothing'})`,
          );
          continue;
        }
        citedParameters.add(ref);
        const declaredQuantity = core.readDeclaredQuantity(parameters[ref]);
        if (declaredQuantity === undefined) {
          // A string is an identifier, not a fact a comparison can be about: `container == 'x'` only
          // restates the parameter in another place, and the parameter is already in the file.
          problems.push(
            `'${caseId}' checkpoint '${id}' cites parameter '${ref}', whose value ` +
              `${JSON.stringify(parameters[ref])} is not a number or a { value, unit } quantity`,
          );
          continue;
        }
        checkpointRefs.resolvedAny += 1;
        checkpointRefs.configuration += 1;
        if (typeof checkpoint.value !== 'number' || !core.isNumericComparator(checkpoint.comparator)) {
          problems.push(
            `'${caseId}' checkpoint '${id}' cites the number '${ref}', and states ` +
              `'${String(checkpoint.value)}' with '${String(checkpoint.comparator)}' beside it`,
          );
          continue;
        }
        // The unit has to be the declared unit, or one the table can convert into it. A unit beside a
        // parameter that carries none is a claim nothing here can check, and the same is true of a
        // parameter with a unit and a checkpoint that states none.
        let stated = declaredQuantity.value;
        if (declaredQuantity.unit === undefined && checkpoint.unit !== undefined) {
          problems.push(
            `'${caseId}' checkpoint '${id}' states '${String(checkpoint.unit)}' for '${ref}', which ` +
              'fault.parameters declares without a unit, so the unit is a claim nothing here can check',
          );
          continue;
        }
        if (declaredQuantity.unit !== undefined && checkpoint.unit === undefined) {
          problems.push(
            `'${caseId}' checkpoint '${id}' cites '${ref}' without a unit, and fault.parameters ` +
              `declares it in '${declaredQuantity.unit}'`,
          );
          continue;
        }
        if (declaredQuantity.unit !== undefined && checkpoint.unit !== declaredQuantity.unit) {
          if (!core.isConvertible(declaredQuantity.unit, checkpoint.unit)) {
            problems.push(
              `'${caseId}' checkpoint '${id}' is in '${String(checkpoint.unit)}' and '${ref}' is ` +
                `declared in '${declaredQuantity.unit}', which are not the same unit and not convertible`,
            );
            continue;
          }
          stated = core.convertUnit(declaredQuantity.value, declaredQuantity.unit, checkpoint.unit);
        }
        checkpointRefs.inequalities += 1;
        // Exact: both sides are literals a person wrote, so a difference is a mistake rather than
        // floating-point drift. The tolerance exists for values this package computed.
        if (!core.compareExactly(checkpoint.comparator, stated, checkpoint.value)) {
          checkpointRefs.false += 1;
          problems.push(
            `'${caseId}' checkpoint '${id}' asserts '${ref}' ${checkpoint.comparator} ` +
              `${String(checkpoint.value)}, and fault.parameters declares ${displayNumber(stated)}` +
              (declaredQuantity.unit === undefined ? '' : ` ${declaredQuantity.unit}`),
          );
        }
        continue;
      }
      // Which series the pair names. The guard read the metric alone out of a map keyed on the name,
      // so the entity in a checkpoint was decoration: 13 of the corpus's 73 series checkpoints name
      // an entity that does not carry the reading -- a container's memory figure filed under its
      // service -- and the same code would have accepted a checkpoint pointed at an unrelated pod.
      // The rule next door had it right, for log lines, since finding 286; ten lines apart, the series
      // branch never looked (finding 323).
      const resolution = core.resolveReading({
        metric: ref,
        entityRef: typeof checkpoint.entityRef === 'string' ? checkpoint.entityRef : '',
        series,
        graph: parsedGraph,
      });
      if (resolution.kind !== 'resolved') {
        problems.push(`'${caseId}' checkpoint '${id}' ${core.describeReadingProblem(resolution)}`);
        continue;
      }
      const declared = resolution.series;
      checkpointRefs.resolved += 1;
      checkpointRefs.resolvedAny += 1;
      if (resolution.via === 'entity') checkpointRefs.byEntity += 1;
      else checkpointRefs.byComponent += 1;
      if (declared.unit !== checkpoint.unit) {
        problems.push(
          `'${caseId}' checkpoint '${id}' is in '${String(checkpoint.unit)}' but the series '${ref}' is in '${String(declared.unit)}'`,
        );
      }
      const comparator = checkpoint.comparator;
      // `NUMERIC_COMPARATORS`, read from the IR rather than restated. This list used to be written
      // here by hand and omitted `!=`, which the schema admits: a `!=` checkpoint was neither
      // compared nor counted, and the count said `8 of 8` as though there had been nothing to check.
      if (!core.isNumericComparator(comparator) || typeof checkpoint.value !== 'number') continue;
      if (declared.unit !== checkpoint.unit) continue;
      checkpointRefs.inequalities += 1;
      // The resolved reading, and `compareExactly` rather than a chain of ternaries: this branch
      // carried its own copy of the six operators until finding 258, which is the third time the
      // package had implemented "compare two numbers" (finding 247 consolidated the other two).
      const post = resolvedReadings.get(readingKey(declared))?.post;
      // A reading that did not resolve already produced a problem; comparing `undefined` here would
      // report it a second time as a failing assertion.
      if (typeof post !== 'number') continue;
      if (!core.compareExactly(comparator, post, checkpoint.value)) {
        checkpointRefs.false += 1;
        problems.push(
          `'${caseId}' checkpoint '${id}' asserts ${ref} ${comparator} ${String(checkpoint.value)}, ` +
            `and the series' post value is ${String(post)}`,
        );
      }
    }

    // What this case's declarations were for, tallied once the checkpoints have been read: a key is
    // cited if a series point names it or a configuration checkpoint does, and every other key has to
    // say why it is there. Refusing an uncited key outright fails thirty cases for thirty legitimate
    // reasons, and an allow-list of descriptive names is today's list turned into a law (finding 300
    // refused both), so the question moved into the file: `fault.parameterNotes`, one sentence per
    // key, and `fault/parameter-notes.ts` refuses a case that does not answer it (finding 326).
    const notes = core.checkParameterNotes({
      parameters,
      notes: rawCase?.fault?.parameterNotes,
      cited: citedParameters,
    });
    for (const fault of notes.faults) {
      problems.push(core.describeParameterNoteFault(fault, caseId));
    }
    parameterUse.referenced += notes.cited;
    parameterUse.noted += notes.noted;
    if (notes.shortest > 0) {
      parameterUse.shortest = parameterUse.shortest === 0
        ? notes.shortest
        : Math.min(parameterUse.shortest, notes.shortest);
    }

    // The ranking declaration, read from the file as written rather than from the parsed case: the
    // schema admits `sli` without judging it, because the sentence that names *which half* of a
    // malformed declaration is missing is worth more than `Invalid input` (export/sli.ts).
    const sli = core.readSliDeclaration({
      sli: rawCase?.sli,
      component: String(parsedCase.groundTruth.rootCauseComponent),
    });
    if (sli.fault !== null) problems.push(core.describeSliFault(sli.fault, caseId));
    else if (sli.column === null) sliUse.none += 1;
    else sliUse.declared += 1;

    // A case's own declaration wins on the `(service, metric)` pair, and the background arrives flat
    // with `noise: 'none'` -- both rules live in `fault/background.ts`, where they are unit-tested.
    const backgroundDeclarations = core.backgroundSeries(series, background.series);
    const signals = [
      ...series.flatMap((one) => core.expandSeries(resolvedDeclaration(one, resolvedReadings), when)),
      ...backgroundDeclarations.flatMap((one) => core.expandSeries(one, when)),
      ...logs.flatMap((one) => core.expandLog(one, when)),
      ...core.expandTraces(traces, when, caseId),
    ];
    telemetryCases.push(parsedCase);
    telemetrySignals[caseId] = signals;
    if (firstGraph === null) firstGraph = parsedGraph;
    if (!backgroundChecked) {
      backgroundChecked = true;
      checkBackgroundAgainst(parsedGraph);
    }
    const withSignals = { ...bundle, signals: { [caseId]: signals } };
    const signalStructure = core.checkG1Structural(withSignals, { requiredSignals: ['metric'], requiresQuery: false });
    for (const violation of signalStructure.violations) {
      problems.push(`'${caseId}' signals fail the L2 structural contract: ${violation.message}`);
    }
    // No second G2 here. This block used to ask `checkG2Semantic` of `withSignals` as well, and the
    // answer was the same in every field: G2 reads the graph and the ground truth, never the
    // telemetry, so the second pass could only repeat the first. What reads telemetry is G1 above
    // and G3 below, and both are asked.
    const validity = core.checkG3Validity(withSignals, {});
    for (const violation of validity.violations) {
      problems.push(`'${caseId}' signals fail G3: ${violation.message}`);
    }
    // G4 as well: a case whose anomaly no baseline can locate is a case that reads as valid and
    // cannot be scored. Two baselines, and `minSolvers: 2`, because one solver only asks whether a
    // method agrees with the construction it was pointed at -- peak-z is sensitive to a single
    // spike and the corpus's series each contain exactly one, so it would have found them whatever
    // the case was. The second is a robust median shift, which cannot see a lone spike and is
    // unaffected by a contaminated baseline; the pair is the claim that the structure is locatable
    // rather than that one inductive bias likes it.
    const outcomes = [
      core.locateWithPeakZScore(parsedCase, signals),
      core.locateWithMedianShift(parsedCase, signals),
    ];
    // Solvability only. The other half of G4 -- whether the graded cases are spread across the
    // levels -- is a property of the corpus and is asked once below; asked here it would see a
    // one-case bundle every time and fall below its own minimum of ten, which is how it stayed
    // unreachable for as long as this script has existed.
    const solvability = core.checkSolvability(withSignals, outcomes, { minSolvers: 2 });
    for (const violation of solvability.violations) {
      const ranks = outcomes.map((one) => `${one.method}=${one.rankOfTruth === null ? 'absent' : String(one.rankOfTruth)}`);
      problems.push(`'${caseId}' is not solvable by both baselines (${ranks.join(', ')}): ${violation.message}`);
    }
    // Why the answer is not first, per run. `classifyDisplacement` separates a strictly louder
    // competitor from a tie broken by name and from a candidate that is a part of the answer; only
    // the first is evidence that the corpus penalises a magnitude-based method.
    const displacements = outcomes.map((one) =>
      core.classifyDisplacement({ graph: parsedGraph, case: parsedCase, ranking: one.candidates ?? [] }),
    );
    localisation.push({
      caseId,
      candidates: Math.max(...outcomes.map((one) => one.candidateCount)),
      topK: Math.min(...outcomes.map((one) => one.topK)),
      ranks: outcomes.map((one) => one.rankOfTruth),
      displacements: displacements.map((one) => one.kind),
    });
    for (const one of displacements) localisationRuns.push(one);
    if (
      validity.violations.length === 0 &&
      signalStructure.violations.length === 0 &&
      solvability.violations.length === 0
    ) {
      withTelemetry.push(caseId);
    }
  }

  const reading = core.assessFourLayer({ case: parsedCase, graph: parsedGraph });
  citedEvidence.total += (parsedCase.groundTruth.evidenceCheckpoints ?? []).length;
  citedEvidence.cited += (parsedCase.groundTruth.evidenceCheckpoints ?? []).length - reading.uncitedEvidence.length;
  const empty = reading.layers.filter((layer) => !layer.filled).map((layer) => `${layer.layer}: ${String(layer.reason)}`);
  const refs = reading.unresolved.map((ref) => `${ref.where} -> ${ref.ref}`);
  const dangling = reading.danglingEvidence.map((ref) => `step ${String(ref.step)} -> ${ref.ref}`);
  const incomplete = [...empty, ...refs, ...dangling];
  if (incomplete.length > 0) {
    problems.push(`'${caseId}' is not complete: ${incomplete.join('; ')}`);
  }
  // The third reference defect, and the only one whose repair is not in the reference itself: the
  // checkpoint is stated, its entity resolves, and no step uses it. Pushed separately because
  // `describeUncitedEvidence` already writes the case's name, and nesting one sentence inside
  // `'<case>' is not complete: ...` would name the case twice in one line.
  for (const entry of reading.uncitedEvidence) {
    problems.push(core.describeUncitedEvidence(entry, caseId));
  }
}

// The other half of G4, asked once. A distribution is a property of the set: the per-case pass
// above cannot see it, and asking the composed gate per case is what kept this rule unreachable.
//
// Two different verdicts come out of this block, and the difference is the point.
//
// A label that claims *less* structure than its own chain carries is an annotation contradicting the
// case it annotates -- the sort of defect a reader can fix in one line -- so it is a problem and the
// run fails.
//
// A missing level, or a set with no hardest case, is a statement about the corpus rather than about
// any annotation: the deepest chain in this corpus is two steps, so no case can be L4, and a rule
// that requires a tenth of the set at L4 cannot be satisfied by any correction to a label. Printing
// it and failing every run would teach everyone to ignore the line; printing it and saying nothing
// would be the vacuous pass this volume keeps removing. So it is printed, with the target it misses,
// and the decision it is waiting for is written down in the progress log rather than encoded here.
if (firstGraph !== null && allCases.length > 0) {
  for (const shortfall of core.findDifficultyShortfalls({ cases: allCases, graph: firstGraph })) {
    problems.push(
      `'${shortfall.caseId}' is labelled ${shortfall.declared} and its own chain supports ` +
        `${shortfall.floor} at least -- a level may not claim less structure than the case carries`,
    );
  }
  const distribution = core.checkDifficultyDistribution(
    { irVersion: '1.0.0', graph: firstGraph, cases: allCases, signals: {} },
    {},
  );
  const counts = { L1: 0, L2: 0, L3: 0, L4: 0 };
  for (const one of allCases) {
    if (one.difficulty !== undefined) counts[one.difficulty] += 1;
  }
  difficultySpread = {
    counts,
    unmet: distribution.violations.map((violation) => violation.message),
  };
}

// Whether the corpus can fail a method that returns the loudest component. Corpus-level, so it is
// asked once, and it fails the run: a corpus of cases whose answer is always the biggest excursion
// reports a 100% score as a measurement of localisation.
for (const violation of core.checkDiscrimination(localisationRuns).violations) {
  problems.push(`the corpus fails G4: ${violation.message}`);
}

// A file in the directory that the index does not name is a case nobody will run.
//
// `background-telemetry.json` is the one exception and it is not a case: it belongs to the corpus
// rather than to any incident, and it is loaded before this loop rather than through the index. It
// is named here instead of being pattern-matched, so a second corpus-level file has to be added
// deliberately rather than slipping in under a naming convention.
const named = new Set([
  'index.json',
  BACKGROUND_FILE,
  ...index.cases.flatMap((entry) => [entry?.case, entry?.graph, entry?.signals].filter((name) => typeof name === 'string')),
]);
const unnamed = readdirSync(args.cases).filter((file) => file.endsWith('.json') && !named.has(file));

if (invalid.length > 0) {
  for (const problem of invalid) console.error(`check-fault-cases: ${problem}`);
  console.error(`check-fault-cases: FAILED — ${String(invalid.length)} case(s) could not be read as a FaultCase`);
  process.exit(1);
}

/**
 * The checkpoint counts, printed on both exits.
 *
 * They used to be printed only on success, which made them a decoration on a green run and an
 * absence on a red one -- the numbers that say *how much of the corpus is actually being checked*
 * were missing exactly when something was wrong with it. A run with one failing assertion of ten now
 * says `1 of 10` and then says which one.
 */
/**
 * How much of what a case declares about itself anything actually reads.
 *
 * Printed on both exits, for the reason the checkpoint counts are: the number that says how much of
 * the annotation is load-bearing is missing exactly when a run is red, which is when it is worth
 * knowing. It is a reading rather than a rule -- `service`, `from` and `trigger` are written for a
 * reader and for a future replay, and refusing them would be arguing with the injection spec.
 */
function logParameterUse() {
  if (parameterUse.declared === 0) return;
  const share = Math.round((parameterUse.referenced / parameterUse.declared) * 100);
  console.log(
    `check-fault-cases: parameters ${String(parameterUse.referenced)} of ${String(parameterUse.declared)} ` +
      `(${String(share)} percent) cited by a reading across ${String(parameterUse.cases)} case(s); ` +
      `${String(parameterUse.noted)} explained by a note, shortest ${String(parameterUse.shortest)} ` +
      'character(s)',
  );
}

/**
 * How many cases name the reading that ranks them, and how many say why none can.
 *
 * Neither number is a target. The split is a fact about the corpus and about the consumer at once:
 * upstream's vocabulary is one word wide (`{service}_latency`), so a case whose symptom is a share
 * or a count has nothing to publish under that name, and the sentence it writes instead is the
 * honest answer rather than a footnote. A reader who sees the share move knows a case changed its
 * symptom, not that a rule was relaxed.
 */
function logSliUse() {
  const total = sliUse.declared + sliUse.none;
  if (total === 0) return;
  console.log(
    `check-fault-cases: sli ${String(sliUse.declared)} of ${String(total)} case(s) name the duration ` +
      `that ranks them, published as \`<service>_latency\`; ${String(sliUse.none)} say why no reading can`,
  );
}

/**
 * What each case answered about logs and spans, on both exits.
 *
 * The share is not a target and not a verdict: an incident that left no useful line is a fact about
 * the incident. What the line has to keep true is that the two halves add up to the corpus, and that
 * the cases whose chain crosses a call are named -- those are the ones whose `noTraces` sentence is
 * carrying weight rather than restating an absence nobody could have filled.
 */
function logModalityUse() {
  const line = (what, counts) => {
    const total = counts.shown + counts.absent + counts.refused;
    if (total === 0) return;
    const unreadable = counts.refused === 0 ? '' : `, ${String(counts.refused)} give no readable answer`;
    console.log(
      `check-fault-cases: evidence ${what} ${String(counts.shown)} of ${String(total)} case(s) show one ` +
        `and ${String(counts.absent)} name what the incident could not carry${unreadable}`,
    );
  };
  line('logs', modalityUse.log);
  line('traces', modalityUse.trace);
  if (modalityUse.crossingWithoutSpan.length > 0) {
    console.log(
      `check-fault-cases: evidence ${String(modalityUse.crossingWithoutSpan.length)} of the ` +
        `${String(modalityUse.withoutTraces)} case(s) with no span still cross a service call in their ` +
        `chain: ${modalityUse.crossingWithoutSpan.join(', ')}`,
    );
  }
}

/**
 * How many cases state a difficulty level.
 *
 * Printed because the exporter projects an absent level to `medium`, so an unannotated case and a
 * case measured as medium are the same word in every output this repository produces. The
 * distribution rule needs ten graded cases; below that it returns passed and says nothing, which is
 * correct and is also indistinguishable from a corpus that passed it. Naming both numbers is what
 * separates "not measured" from "measured and fine".
 */
function logDifficultyCoverage() {
  if (allCases.length === 0) return;
  console.log(
    `check-fault-cases: difficulty ${String(gradedCases.length)} of ${String(allCases.length)} case(s) ` +
      'state a level; the distribution rule applies at 10',
  );
  if (difficultySpread === null) return;
  const { counts, unmet } = difficultySpread;
  console.log(
    `check-fault-cases: difficulty spread L1 ${String(counts.L1)} / L2 ${String(counts.L2)} / ` +
      `L3 ${String(counts.L3)} / L4 ${String(counts.L4)}; ` +
      (unmet.length === 0 ? 'within the target' : `outside the target -- ${unmet.join('; ')}`),
  );
}

/** Where the two baselines put the answer, and how wide the ranking was. */
function logLocalisationReading() {
  if (localisation.length === 0) return;
  const widths = localisation.map((one) => one.candidates);
  const narrowest = Math.min(...widths);
  const widest = Math.max(...widths);
  const topK = localisation[0].topK;
  const tally = new Map();
  for (const one of localisation) {
    for (const rank of one.ranks) {
      const key = rank === null ? 'absent' : `rank ${String(rank)}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  const parts = [...tally.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, count]) => `${key}: ${String(count)}`);
  // How many cases displace the answer: the ones a method that returns the largest excursion gets
  // wrong. Zero would mean the corpus tests detection, which is why the gate above refuses it.
  const kindTally = new Map();
  for (const one of localisationRuns) kindTally.set(one.kind, (kindTally.get(one.kind) ?? 0) + 1);
  const kinds = ['strict', 'tie', 'same-component', 'none']
    .map((kind) => `${kind} ${String(kindTally.get(kind) ?? 0)}`)
    .join(', ');
  // The cases a method that returns the largest excursion gets wrong *deterministically*: the ones
  // where a separate component is strictly louder than the answer.
  const displaced = localisation.filter((one) => one.displacements.includes('strict'));
  console.log(
    `check-fault-cases: localisation over ${String(localisation.length)} case(s) at top-${String(topK)}, ` +
      `rankings ${String(narrowest)}-${String(widest)} candidate(s) wide -- ${parts.join(', ')} of ` +
      `${String(localisation.length * 2)} baseline run(s) -- ${kinds}; strictly displaced in ` +
      `${String(displaced.length)} case(s) (${displaced.map((one) => one.caseId).join(', ') || 'none'})`,
  );
}

function logCheckpointCounts() {
  if (checkpointRefs.total === 0) return;
  // The log kind is counted inside the parenthetical, because the four kinds are a partition of the
  // total and a reader has to be able to add them up. Its *assertion* is counted outside it, on the
  // other side of the semicolon, because a log checkpoint is not one of the comparable ones: it is
  // compared with text, so it fails or holds for a reason the arithmetic beside it cannot express.
  console.log(
    `check-fault-cases: checkpoints ${String(checkpointRefs.resolvedAny)} of ` +
      `${String(checkpointRefs.total)} reference(s) resolve by kind (${String(checkpointRefs.resolved)} over a ` +
      `series -- ${String(checkpointRefs.byEntity)} on the entity the checkpoint names and ` +
      `${String(checkpointRefs.byComponent)} on one that contains it -- ${String(checkpointRefs.derived)} computed from ` +
      `${String(checkpointRefs.derivedRefs)} reading(s), ${String(checkpointRefs.configuration)} citing a ` +
      `declared configuration fact, ${String(checkpointRefs.logLines)} over a log line); ` +
      `${String(citedEvidence.cited)} of ${String(citedEvidence.total)} checkpoint(s) are cited by at least one ` +
      `causal step; ` +
      `${String(checkpointRefs.false)} of ` +
      `${String(checkpointRefs.inequalities)} comparable assertion(s) fail against the data they name; ` +
      `${String(checkpointRefs.logHolds)} of ${String(checkpointRefs.logLines)} log assertion(s) hold ` +
      'against the body they cite',
  );
}

/** Where the two numbers below are kept, so they can be printed on both exits. */
let coverageLine = null;
const exportLines = [];
const SUITE_TARGETS = [['RE1', 'rcaeval-re1'], ['RE2', 'rcaeval-re2'], ['RE3', 'rcaeval-re3']];

// The corpus through the two modules that decide whether it can be evaluated at all. Neither number
// existed before this round: the coverage report was only ever handed bundles bound for official
// scoring, and the exporter only ever saw datasets that already had what it needs. Asked of the
// annotated corpus, they disagree, and the disagreement is the finding (238).
//
// ## What this used to count, and why it now reads the cases instead
//
// The exporter declared `logs.csv` and `traces.csv` for RE2 and RE3 and wrote both for every case:
// 19 of 30 `logs.csv` and 25 of 30 `traces.csv` held a header and nothing under it. This block
// counted those files and printed the count. The exporter now writes a table only when the case has
// the modality (finding 321), so the count would be a constant zero -- a number no run can move and a
// branch no input can reach, which is the shape this project removes rather than keeps (finding 285).
// The invariant that used to be measured here is asserted where it can fail: the exporter's own unit
// tests, over cases built to carry one modality, the other, both and neither.
//
// What replaces it is the fact the corpus can act on: how many exported cases carry a log table and
// how many carry a span table. A case with no log line is a case the log-based methods cannot be
// asked about, and the old count said so only as a total over files.
if (telemetryCases.length > 0 && firstGraph !== null) {
  const bundle = { irVersion: '1.0.0', graph: firstGraph, cases: telemetryCases, signals: telemetrySignals };
  const { feasibility } = core.computeCoverage(bundle);
  coverageLine = SUITE_TARGETS.map(([, target]) => {
    const entry = feasibility.find((f) => f.target === target);
    const missing = entry === undefined || entry.missingSignals.length === 0 ? '' : ` (no ${entry.missingSignals.join(', ')})`;
    return `${target} ${entry === undefined ? 'absent' : entry.status}${missing}`;
  }).join(' · ');

  for (const [suite] of SUITE_TARGETS) {
    const outcome = core.exportRcaEval(bundle, suite);
    // The leaf case directory, `{suite}-{system}/{service}_{fault}/{instance}`, not
    // the suite-system directory above it: every case of one system shares that
    // top level, so counting it reported 13 annotated cases as one (finding 267).
    const dirs = new Set(
      Object.keys(outcome.files).map((path) => path.slice(0, path.lastIndexOf('/'))),
    );
    // Which modalities the written cases actually carry, read off the exporter's own file names so
    // a new modality is named by whatever the exporter calls it rather than by a list kept here
    // (finding 287). Only for the suites that declare them: `RCAEVAL_LOGS_COLUMNS` is RE2 and RE3,
    // and asking RE1 whether its cases have logs would report a metric-only suite as deficient.
    //
    // And only when something was written: `logs in 0 of 0` is a share of nothing, which reads as a
    // corpus that lost every case rather than as a suite that refused the one it was given.
    const modalities =
      Object.hasOwn(core.RCAEVAL_LOGS_COLUMNS, suite) && dirs.size > 0
        ? ['logs', 'traces'].map((table) => {
            const carrying = new Set(
              Object.keys(outcome.files)
                .filter((path) => path.endsWith(`/${table}.csv`))
                .map((path) => path.slice(0, path.lastIndexOf('/'))),
            );
            return `, ${table} in ${String(carrying.size)} of ${String(dirs.size)}`;
          })
        : [];
    // The column upstream actually looks for, counted off the tables rather than off the
    // declarations: `sli` says what the file meant and this says what the dataset carries, and two
    // instruments for one fact is the only way either of them can be wrong out loud (finding 331).
    const ranking = Object.entries(outcome.files).filter(
      ([path, text]) => path.endsWith('/data.csv') && text.split('\n')[0]?.split(',').some((column) => column.endsWith(core.SLI_SUFFIX)),
    ).length;
    if (dirs.size > 0) modalities.push(`, a \`${core.SLI_SUFFIX.replace('_', '')}\` column in ${String(ranking)} of ${String(dirs.size)}`);
    exportLines.push(
      `${suite} ${String(dirs.size)} case(s) written${modalities.join('')}` +
        (outcome.skipped.length === 0 ? '' : `, ${String(outcome.skipped.length)} skipped`),
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`check-fault-cases: ${problem}`);
  logDifficultyCoverage();
  logParameterUse();
  logSliUse();
  logModalityUse();
  logExportReading();
  logLocalisationReading();
  logCheckpointCounts();
  console.error(
    `check-fault-cases: FAILED — ${String(problems.length)} problem(s) across ${String(index.cases.length)} case(s)`,
  );
  process.exit(2);
}

if (unnamed.length > 0) {
  // Named rather than ignored: a case file the index does not list is a case that never runs,
  // and the directory reading as "one case" while holding two is the kind of count this
  // repository keeps having to fix.
  for (const file of unnamed) console.error(`check-fault-cases: ${file} is not named in index.json`);
  console.error(`check-fault-cases: FAILED — ${String(unnamed.length)} file(s) in ${args.cases} are not indexed`);
  process.exit(2);
}

if (index.cases.length < floor) {
  console.error(
    `check-fault-cases: FAILED — ${String(index.cases.length)} four-layer case(s), below the floor of ` +
      `${String(floor)}. The floor is raised as annotation proceeds; lowering it is a decision, not a repair.`,
  );
  process.exit(2);
}

// The corpus through the two modules that decide whether it can be evaluated at all. Neither number
// existed before this round: the coverage report was only ever handed bundles bound for official
// scoring, and the exporter only ever saw datasets that already had what it needs. Asked of the
// annotated corpus, they disagree, and the disagreement is the finding (238).
/** What each suite's export holds, and which of its cases carry which modality. */
function logExportReading() {
  if (coverageLine === null) return;
  console.log(`check-fault-cases: coverage ${coverageLine}`);
  console.log(`check-fault-cases: export ${exportLines.join(' · ')}`);
}

// Outside the export block on purpose: a corpus with no derived telemetry still states levels, and
// the coverage line vanished from exactly those runs while it lived inside it.
logDifficultyCoverage();
logParameterUse();
logSliUse();
logModalityUse();
logExportReading();
logLocalisationReading();
logCheckpointCounts();

console.log(
  `check-fault-cases: OK (${String(index.cases.length)} of ${String(known.size)} sample(s) carry a four-layer ` +
    `case; each is complete, every reference resolves, every layer quotes a sentence the incident ` +
    `text contains, and every case passes G1, G2 and G5 -- structure, references, units, and no ` +
    `leaked identifiers; ${String(withTelemetry.length)} of ${String(index.cases.length)} also carry ` +
    `telemetry whose origin is declared, which passes G3, and which both the peak-z and the ` +
    `median-shift baselines place in their top-K; floor ${String(floor)})`,
);
