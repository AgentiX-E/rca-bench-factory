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
/** What the checkpoints of every annotated case claim about the signals it declares. */
const checkpointRefs = {
  total: 0,
  resolved: 0,
  resolvedAny: 0,
  derived: 0,
  derivedRefs: 0,
  configuration: 0,
  inequalities: 0,
  false: 0,
};
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
      resolvedReadings.set(metric, points);
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
          const value = resolvedReadings.get(String(one?.metric))?.[point];
          if (typeof value !== 'number') continue;
          if (value < bounds.min || value > bounds.max) {
            problems.push(
              `'${caseId}' declares ${point} ${String(value)} for '${String(one?.metric)}' in ` +
                `'${one.unit}', and a reading in '${one.unit}' lies in ${range}`,
            );
          }
        }
      }
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

    // What each checkpoint's reference is a reference *to*, and whether it resolves.
    //
    // `signalRef` was one optional string carrying four different things, and nothing resolved it:
    // eight of eleven named a series that did not exist (finding 243). `signalKind` says which kind,
    // and each kind has its own rule, because a rule that treated them alike would be wrong for at
    // least one of them.
    const seriesByMetric = new Map();
    for (const one of series) {
      const metric = String(one?.metric);
      // Two declarations of one metric: a reference resolves to whichever came second, and nothing in
      // the file says which of them the checkpoint meant. Reported because the resolution that
      // follows would otherwise be a coin toss the guard does not know it is making.
      if (seriesByMetric.has(metric)) {
        problems.push(`'${caseId}' declares two series named '${metric}', so a reference to it names neither`);
        continue;
      }
      seriesByMetric.set(metric, one);
    }
    // The same series in the shape the expression evaluator reads, with every point in
    // `SERIES_POINTS` read through the tuple -- so a third point needs an edit in one place.
    const expressionSeries = series.map((one) => ({
      metric: String(one?.metric),
      unit: typeof one?.unit === 'string' ? one.unit : '',
      points: resolvedReadings.get(String(one?.metric)) ?? {},
    }));
    const logIds = new Set();
    for (const one of logs) {
      const id = typeof one?.id === 'string' ? one.id : '';
      if (id === '') {
        problems.push(`'${caseId}' declares a log line with no id, which nothing can reference`);
        continue;
      }
      if (logIds.has(id)) problems.push(`'${caseId}' declares two log lines with id '${id}'`);
      logIds.add(id);
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
        if (logIds.has(ref)) checkpointRefs.resolvedAny += 1;
        if (!logIds.has(ref)) {
          problems.push(`'${caseId}' checkpoint '${id}' names log '${ref}', which the signals file does not declare (it declares: ${[...logIds].join(', ') || 'none'})`);
        }
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
      const declared = seriesByMetric.get(ref);
      if (declared === undefined) {
        problems.push(
          `'${caseId}' checkpoint '${id}' names '${ref}', which the signals file does not declare ` +
            `(it declares: ${[...seriesByMetric.keys()].join(', ') || 'none'})`,
        );
        continue;
      }
      checkpointRefs.resolved += 1;
      checkpointRefs.resolvedAny += 1;
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
      const post = resolvedReadings.get(ref)?.post;
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

    const when = expansionTime(parsedCase);
    const signals = [
      ...series.flatMap((one) =>
        core.expandSeries(
          { ...one, ...(resolvedReadings.get(String(one?.metric)) ?? {}) },
          when,
        ),
      ),
      ...logs.flatMap((one) => core.expandLog(one, when)),
      ...core.expandTraces(traces, when, caseId),
    ];
    telemetryCases.push(parsedCase);
    telemetrySignals[caseId] = signals;
    if (firstGraph === null) firstGraph = parsedGraph;
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

/**
 * The checkpoint counts, printed on both exits.
 *
 * They used to be printed only on success, which made them a decoration on a green run and an
 * absence on a red one -- the numbers that say *how much of the corpus is actually being checked*
 * were missing exactly when something was wrong with it. A run with one failing assertion of ten now
 * says `1 of 10` and then says which one.
 */
function logCheckpointCounts() {
  if (checkpointRefs.total === 0) return;
  console.log(
    `check-fault-cases: checkpoints ${String(checkpointRefs.resolvedAny)} of ` +
      `${String(checkpointRefs.total)} reference(s) resolve by kind (${String(checkpointRefs.resolved)} over a ` +
      `series, ${String(checkpointRefs.derived)} of them computed from ` +
      `${String(checkpointRefs.derivedRefs)} reading(s), ${String(checkpointRefs.configuration)} citing a ` +
      `declared configuration fact); ${String(checkpointRefs.false)} of ` +
      `${String(checkpointRefs.inequalities)} comparable assertion(s) fail against the data they name`,
  );
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`check-fault-cases: ${problem}`);
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
    // The leaf case directory, `{suite}-{system}/{service}_{fault}/{instance}`, not
    // the suite-system directory above it: every case of one system shares that
    // top level, so counting it reported 13 annotated cases as one (finding 267).
    const dirs = new Set(
      Object.keys(outcome.files).map((path) => path.slice(0, path.lastIndexOf('/'))),
    );
    exportLines.push(
      `${suite} ${String(dirs.size)} case(s) written, ${String(emptyFiles.length)} file(s) with no rows` +
        (outcome.skipped.length === 0 ? '' : `, ${String(outcome.skipped.length)} skipped`),
    );
  }
  console.log(`check-fault-cases: export ${exportLines.join(' · ')}`);
  logCheckpointCounts();
}

console.log(
  `check-fault-cases: OK (${String(index.cases.length)} of ${String(known.size)} sample(s) carry a four-layer ` +
    `case; each is complete, every reference resolves, every layer quotes a sentence the incident ` +
    `text contains, and every case passes G1, G2 and G5 -- structure, references, units, and no ` +
    `leaked identifiers; ${String(withTelemetry.length)} of ${String(index.cases.length)} also carry ` +
    `telemetry whose origin is declared, which passes G3, and which both the peak-z and the ` +
    `median-shift baselines place in their top-K; floor ${String(floor)})`,
);
