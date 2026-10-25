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

import { readFileSync, readdirSync } from 'node:fs';
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
 * Turn a declared series into metric signals on a fixed cadence.
 *
 * The values are derived, not captured: `baseline` and `post` are the two numbers the incident
 * text states, and the jitter is a fixed cycle rather than a random one so that two runs produce
 * the same file. A counter is expanded as an accumulating series, because a counter that jumped
 * to its post value would be a level wearing a counter's name.
 *
 * The cadence is ninety seconds and the counts are eight and eight: enough post-onset samples for
 * G3's sustained-anomaly rule (three consecutive) with room to spare, and short enough to stay
 * inside every window this corpus declares.
 */
const STEP_MS = 90_000;
const POINTS = 8;
const JITTER = [0, 1, -1, 0.5, -0.5, 0.8, -0.8, 0.3];

/**
 * How a declared series gets from its baseline to its post value. A closed vocabulary.
 *
 * - `step` (the default): eight post-onset points at the post value, which is a level change.
 * - `counter`: an accumulating series, because a counter that jumps to its post value is a level
 *   wearing a counter's name.
 * - `spike`: one post-onset point at the post value, then the baseline again -- a brief excursion
 *   rather than a sustained one.
 *
 * `spike` exists because a corpus that can only express a step cannot say what a brief excursion
 * looks like, and the two baselines treat that shape differently: peak-z cannot distinguish it from
 * a sustained change (both are one large sample), and a median over eight samples barely notices it.
 * Without the shape there would be no way to build the negative control that proves G4's two-solver
 * requirement is doing something (see `check-fault-cases.test.ts`).
 *
 * The vocabulary is closed because the first version tested `derivation === 'counter'` and treated
 * **everything else as a step** -- so a typo would silently produce a different shape from the one
 * the author wrote, and the derived series would be wrong in a way no reading of the file reveals.
 */
const DERIVATIONS = ['step', 'counter', 'spike'];

function expandSeries(declaration, faultCase) {
  const startMs = Date.parse(faultCase.window.start);
  const onsetMs = Date.parse(faultCase.injectTime);
  const service = String(declaration.service);
  const name = String(declaration.metric);
  const unit = typeof declaration.unit === 'string' ? declaration.unit : undefined;
  const baseline = Number(declaration.baseline);
  const post = Number(declaration.post);
  const derivation = declaration.derivation === undefined ? 'step' : declaration.derivation;
  const counter = derivation === 'counter';
  const spike = derivation === 'spike';
  const step = counter ? (post - baseline) / POINTS : 0;
  const out = [];
  const at = (ms) => new Date(ms).toISOString();

  for (let index = 0; index < POINTS; index += 1) {
    const t = startMs + index * STEP_MS;
    if (t >= onsetMs) break;
    const value = counter ? baseline + index * 0.1 : baseline * (1 + JITTER[index] * 0.02);
    out.push({ timestamp: at(t), value });
  }
  for (let index = 0; index < POINTS; index += 1) {
    const t = onsetMs + index * STEP_MS;
    // A spike is one sample at the post value and then the baseline again; the jitter is applied to
    // the level the sample sits at, so the excursion is post-sized and the return is baseline-sized.
    const level = counter ? baseline + (index + 1) * step : spike && index > 0 ? baseline : post;
    const value = counter ? level : level * (1 + JITTER[index] * 0.02);
    out.push({ timestamp: at(t), value });
  }

  return out.map((row) => ({
    irVersion: '1.0.0',
    resource: { 'service.name': service },
    timestamp: row.timestamp,
    signal: 'metric',
    payload: { kind: 'metric', name, ...(unit === undefined ? {} : { unit }), value: Number(row.value.toFixed(6)) },
  }));
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
/** Cases whose derived telemetry passed G1's signal rules and G3. Reported, not gated. */
const withTelemetry = [];
/** The same telemetry, in the shape an exporter reads: cases and the signals attached to them. */
const telemetryCases = [];
const telemetrySignals = {};
let firstGraph = null;

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
    // two call for different repairs, so they get different exit codes.
    invalid.push(`'${caseId}' does not parse: ${String(error instanceof Error ? error.message : error).split('\n')[0]}`);
    continue;
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
  const semantic = core.checkG2Semantic(bundle);
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
    const series = Array.isArray(declaration.series) ? declaration.series : [];
    if (series.length === 0) {
      problems.push(`'${caseId}' declares an empty signal series`);
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
    }
    const signals = series.flatMap((one) => expandSeries(one, parsedCase));
    telemetryCases.push(parsedCase);
    telemetrySignals[caseId] = signals;
    if (firstGraph === null) firstGraph = parsedGraph;
    const withSignals = { ...bundle, signals: { [caseId]: signals } };
    const signalStructure = core.checkG1Structural(withSignals, { requiredSignals: ['metric'], requiresQuery: false });
    for (const violation of signalStructure.violations) {
      problems.push(`'${caseId}' signals fail the L2 structural contract: ${violation.message}`);
    }
    const signalSemantics = core.checkG2Semantic(withSignals);
    for (const violation of signalSemantics.violations) {
      problems.push(`'${caseId}' signals fail the L2 reference contract: ${violation.message}`);
    }
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
    const solvability = core.checkG4Solvability(withSignals, outcomes, { minSolvers: 2 });
    for (const violation of solvability.violations) {
      const ranks = outcomes.map((one) => `${one.method}=${one.rankOfTruth === null ? 'absent' : String(one.rankOfTruth)}`);
      problems.push(`'${caseId}' is not solvable by both baselines (${ranks.join(', ')}): ${violation.message}`);
    }
    if (
      validity.violations.length === 0 &&
      signalStructure.violations.length === 0 &&
      solvability.violations.length === 0
    ) {
      withTelemetry.push(caseId);
    }
  }

  const reading = core.assessFourLayer({ case: parsedCase, graph: parsedGraph });
  if (!reading.complete) {
    const empty = reading.layers.filter((layer) => !layer.filled).map((layer) => `${layer.layer}: ${String(layer.reason)}`);
    const refs = reading.unresolved.map((ref) => `${ref.where} -> ${ref.ref}`);
    const dangling = reading.danglingEvidence.map((ref) => `step ${String(ref.step)} -> ${ref.ref}`);
    problems.push(`'${caseId}' is not complete: ${[...empty, ...refs, ...dangling].join('; ')}`);
  }
}

// A file in the directory that the index does not name is a case nobody will run.
const named = new Set([
  'index.json',
  ...index.cases.flatMap((entry) => [entry?.case, entry?.graph, entry?.signals].filter((name) => typeof name === 'string')),
]);
const unnamed = readdirSync(args.cases).filter((file) => file.endsWith('.json') && !named.has(file));

if (invalid.length > 0) {
  for (const problem of invalid) console.error(`check-fault-cases: ${problem}`);
  console.error(`check-fault-cases: FAILED — ${String(invalid.length)} case(s) could not be read as a FaultCase`);
  process.exit(1);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`check-fault-cases: ${problem}`);
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
/**
 * Whether an exported file exists but carries no data.
 *
 * The first version of this counted lines, which called `metrics.json` empty -- it is one line of
 * JSON -- and `inject_time.txt` empty, which is one line *by design*. Emptiness is a property of the
 * content: a CSV with no rows below its header, or a JSON object with no keys.
 */
function isEmptyDataFile(path, body) {
  if (path.endsWith('.json')) {
    try {
      const parsed = JSON.parse(String(body));
      if (Array.isArray(parsed)) return parsed.length === 0;
      return typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length === 0;
    } catch {
      return false;
    }
  }
  if (path.endsWith('.csv')) return String(body).trimEnd().split('\n').length <= 1;
  return false;
}

const SUITE_TARGETS = [['RE1', 'rcaeval-re1'], ['RE2', 'rcaeval-re2'], ['RE3', 'rcaeval-re3']];
const exportLines = [];

if (telemetryCases.length > 0 && firstGraph !== null) {
  const bundle = { irVersion: '1.0.0', graph: firstGraph, cases: telemetryCases, signals: telemetrySignals };
  const { feasibility } = core.computeCoverage(bundle);
  const coverageLine = SUITE_TARGETS.map(([, target]) => {
    const entry = feasibility.find((f) => f.target === target);
    const missing = entry === undefined || entry.missingSignals.length === 0 ? '' : ` (no ${entry.missingSignals.join(', ')})`;
    return `${target} ${entry === undefined ? 'absent' : entry.status}${missing}`;
  });
  console.log(`check-fault-cases: coverage ${coverageLine.join(' · ')}`);

  for (const [suite] of SUITE_TARGETS) {
    const outcome = core.exportRcaEval(bundle, suite);
    // A CSV with a header and no rows is a file that exists and says nothing. Counted rather than
    // refused, because refusing would change a shared contract the official round trip depends on
    // (the round trip's own RE2 case carries metrics only) -- so the count is the report.
    const emptyFiles = Object.entries(outcome.files).filter(([path, body]) => isEmptyDataFile(path, body));
    const dirs = new Set(Object.keys(outcome.files).map((path) => path.slice(0, path.indexOf('/'))));
    exportLines.push(
      `${suite} ${String(dirs.size)} case(s) written, ${String(emptyFiles.length)} file(s) with no rows` +
        (outcome.skipped.length === 0 ? '' : `, ${String(outcome.skipped.length)} skipped`),
    );
  }
  console.log(`check-fault-cases: export ${exportLines.join(' · ')}`);
}

console.log(
  `check-fault-cases: OK (${String(index.cases.length)} of ${String(known.size)} sample(s) carry a four-layer ` +
    `case; each is complete, every reference resolves, every layer quotes a sentence the incident ` +
    `text contains, and every case passes G1, G2 and G5 -- structure, references, units, and no ` +
    `leaked identifiers; ${String(withTelemetry.length)} of ${String(index.cases.length)} also carry ` +
    `telemetry whose origin is declared, which passes G3, and which both the peak-z and the ` +
    `median-shift baselines place in their top-K; floor ${String(floor)})`,
);
