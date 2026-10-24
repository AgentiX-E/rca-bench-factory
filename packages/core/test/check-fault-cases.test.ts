import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The corpus guard: every four-layer case is complete, and its references answer.
 *
 * `four-layer.test.ts` pins what the reading means for one case. This file pins what the guard
 * does with a directory -- which is the part that can fail quietly: it can accept a case whose
 * chain was deleted, count a case whose references name nothing, or report coverage for a
 * sample the key does not carry.
 *
 * Every exit the script owns has a case here, because the script is the only thing standing
 * between an annotation and the claim that M1's four-layer condition is being met.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-fault-cases.mjs');
const CASES = resolve(ROOT, 'golden-master', 'fault-cases');

const DRIVES = ['scripts/check-fault-cases.mjs'];

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'check-fault-cases-'));
  dirs.push(dir);
  return dir;
}

const REAL_CASE = JSON.parse(readFileSync(join(CASES, 'history-checkout-cpu-saturation.json'), 'utf8')) as Record<
  string,
  unknown
>;
const REAL_GRAPH = JSON.parse(readFileSync(join(CASES, 'synthetic-storefront-graph.json'), 'utf8')) as unknown;

const WHY =
  'annotated from the incident text: the container, the pod and the service are named, and the two steps are the text sequence';

interface Entry {
  caseId?: string;
  sampleId?: string;
  case?: string;
  graph?: string;
  why?: string;
  sources?: unknown;
}

const REAL_SOURCES = (JSON.parse(readFileSync(join(CASES, 'index.json'), 'utf8')) as { cases: Array<{ sources: unknown }> })
  .cases[0]!.sources;

/**
 * A corpus directory with one case, plus whatever the caller wants changed.
 *
 * The case is the real annotation, deep-copied, so a test that empties one layer is editing the
 * sample rather than a stub that could not have the defect in the first place.
 */
function corpus(options: {
  entry?: Entry;
  mutate?: (faultCase: Record<string, unknown>) => void;
  mutateGraph?: (graph: Record<string, unknown>) => void;
  min?: number;
  extraFiles?: string[];
  index?: Record<string, unknown>;
  /** A derived-signals declaration to write beside the case, when the test needs one. */
  signals?: Record<string, unknown>;
}): string {
  const dir = workspace();
  const faultCase = JSON.parse(JSON.stringify(REAL_CASE)) as Record<string, unknown>;
  const graph = JSON.parse(JSON.stringify(REAL_GRAPH)) as Record<string, unknown>;
  options.mutate?.(faultCase);
  options.mutateGraph?.(graph);
  writeFileSync(join(dir, 'case.json'), `${JSON.stringify(faultCase, null, 2)}\n`);
  writeFileSync(join(dir, 'graph.json'), `${JSON.stringify(graph, null, 2)}\n`);
  const index = options.index ?? {
    schema: 'rca-bench-fault-cases/2',
    min: options.min ?? 1,
    cases: [
      {
        caseId: 'history-checkout-cpu-saturation',
        sampleId: 'resource-cpu-saturation-checkout',
        case: 'case.json',
        graph: 'graph.json',
        why: WHY,
        sources: REAL_SOURCES,
        ...(options.signals === undefined ? {} : { signals: 'signals.json' }),
        ...options.entry,
      },
    ],
  };
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  if (options.signals !== undefined) {
    writeFileSync(join(dir, 'signals.json'), `${JSON.stringify(options.signals, null, 2)}\n`);
  }
  for (const file of options.extraFiles ?? []) writeFileSync(join(dir, file), '{}\n');
  return dir;
}

function run(args: string[]): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe('check-fault-cases · the corpus as it stands', () => {
  it('accepts the shipped corpus and reports how many samples carry a case', () => {
    const result = run([]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('3 of 30 sample(s) carry a four-layer case');
    expect(result.out).toContain('every reference resolves');
    expect(result.out).toContain('every layer quotes a sentence the incident text contains');
    expect(result.out).toContain('every case passes G1, G2 and G5 -- structure, references, units, and no leaked identifiers');
  });

  it('accepts a corpus whose only case is the same one copied to a scratch directory', () => {
    // The path is a parameter, so the guard is not pinned to one directory. This is also what
    // lets the negative cases below run without touching the repository.
    const result = run(['--cases', corpus({})]);
    expect(result.status, result.out).toBe(0);
    // One, because the scratch corpus holds the one case the helper writes -- which is also what
    // proves the count is read from the directory it was given rather than from the repository.
    expect(result.out).toContain('1 of 30');
  });
});

describe('check-fault-cases · a case that is not complete', () => {
  it('refuses a case whose causal chain was deleted, naming the layer and the reason', () => {
    const dir = corpus({
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        delete truth.causalChain;
      },
    });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('process: groundTruth.causalChain is absent or empty');
  });

  it('refuses a case whose checkpoint names an entity the graph does not carry', () => {
    const dir = corpus({
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
        checkpoints[0]!.entityRef = 'container:synthetic-storefront/gone';
      },
    });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('groundTruth.evidenceCheckpoints[cp-cpu-limit].entityRef -> container:synthetic-storefront/gone');
  });

  it('refuses a case whose step cites evidence it does not state', () => {
    const dir = corpus({
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        const chain = truth.causalChain as Array<Record<string, unknown>>;
        chain[0]!.evidenceRefs = ['cp-nowhere'];
      },
    });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('step 1 -> cp-nowhere');
  });

  it('refuses a case whose root cause resolves nowhere', () => {
    const dir = corpus({
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        truth.rootCauseEntityId = 'service:synthetic-storefront/never-existed';
      },
    });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('entity: \'service:synthetic-storefront/never-existed\' resolves to no entity in the graph');
  });
});

describe('check-fault-cases · the link back to the extraction key', () => {
  it('refuses a case annotated from a sample the key does not carry', () => {
    // Otherwise the coverage figure is a number about a directory rather than about the key.
    const dir = corpus({ entry: { sampleId: 'no-such-sample' } });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("names sample 'no-such-sample', which the extraction key does not carry");
  });

  it('refuses an entry that does not say where its annotation came from', () => {
    const dir = corpus({ entry: { why: 'because' } });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('does not say in at least forty characters');
  });

  it('refuses two annotations of one case', () => {
    const dir = corpus({});
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as Record<string, unknown>;
    const cases = index.cases as unknown[];
    index.cases = [...cases, cases[0]];
    writeFileSync(join(dir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('appears twice in the index');
  });

  it('refuses a case file the index does not name', () => {
    // A file nobody indexed is a case that never runs, and the directory reading as one case
    // while holding two is the count defect this repository keeps fixing.
    const dir = corpus({ extraFiles: ['orphan.json'] });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('orphan.json is not named in index.json');
  });
});

describe('check-fault-cases · the floor moves up, and cannot be quietly lowered', () => {
  it('refuses a corpus below its own floor', () => {
    const dir = corpus({ min: 2 });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('1 four-layer case(s), below the floor of 2');
    expect(result.out).toContain('lowering it is a decision, not a repair');
  });

  it('reads a missing floor as zero rather than refusing the corpus', () => {
    // `min` is the one field that may be absent: a corpus with cases and no floor still has
    // cases, and inventing a floor would be the guard grading its own homework.
    const dir = corpus({});
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as Record<string, unknown>;
    delete index.min;
    writeFileSync(join(dir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
    const result = run(['--cases', dir]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('floor 0');
  });
});

describe('check-fault-cases · inputs it will not guess at', () => {
  it('refuses a case that does not parse, with exit 1 and the schema message', () => {
    const dir = corpus({
      mutate: (faultCase) => {
        (faultCase.fault as Record<string, unknown>).category = 'not-a-category';
      },
    });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(1);
    expect(result.out).toContain('does not parse');
  });

  it('refuses an index with the wrong schema', () => {
    const dir = corpus({ index: { schema: 'something-else', cases: [] } });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(1);
    expect(result.out).toContain("has schema 'something-else'");
  });

  it('refuses an index with no cases array', () => {
    const dir = corpus({ index: { schema: 'rca-bench-fault-cases/2' } });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(1);
    expect(result.out).toContain("has no 'cases' array");
  });

  it('refuses a missing index and a missing key by name', () => {
    const empty = workspace();
    const missingIndex = run(['--cases', empty]);
    expect(missingIndex.status).toBe(1);
    expect(missingIndex.out).toContain('could not read the case index');

    const dir = corpus({});
    const missingKey = run(['--cases', dir, '--samples', join(empty, 'nope.json')]);
    expect(missingKey.status).toBe(1);
    expect(missingKey.out).toContain('could not read the extraction key');
  });

  it('refuses an unknown argument and explains itself on --help', () => {
    const unknown = run(['--nonsense']);
    expect(unknown.status).toBe(1);
    expect(unknown.out).toContain("unknown argument '--nonsense'");

    const help = run(['--help']);
    expect(help.status).toBe(0);
    expect(help.out).toContain('usage: node scripts/check-fault-cases.mjs');
  });
});

describe('check-fault-cases · every layer shows the sentence it came from', () => {
  type Source = { layer: string; quote: string; why: string };

  /** The real annotation's sources, deep-copied so an edit cannot leak into the next test. */
  function sources(): Source[] {
    return JSON.parse(JSON.stringify(REAL_SOURCES)) as Source[];
  }

  it('refuses a quote the incident text does not contain, one word changed', () => {
    // The defect this is for: an annotator paraphrases the source from memory and the case then
    // rests on a sentence nobody wrote. One word is enough to fail it.
    const edited = sources();
    edited[0]!.quote = 'the pod sat pinned at its 400m limit';
    const result = run(['--cases', corpus({ entry: { sources: edited } })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('cites a entity quote the incident text does not contain');
    expect(result.out).toContain('the pod sat pinned at its 400m limit');
  });

  it('accepts a quote whose whitespace differs from the text, because words are the claim', () => {
    // The comparison folds whitespace rather than bytes: a quote reflowed across two lines is the
    // same sentence, and failing it would train the annotator to copy line breaks.
    const edited = sources();
    edited[1]!.quote = 'Container CPU throttling   counters climbed the whole time';
    const result = run(['--cases', corpus({ entry: { sources: edited } })]);
    expect(result.status, result.out).toBe(0);
  });

  it('refuses a corpus that quotes three layers and leaves one unsupported', () => {
    const edited = sources().filter((source) => source.layer !== 'process');
    const result = run(['--cases', corpus({ entry: { sources: edited } })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('quotes no sentence for: process');
  });

  it('refuses a quote too short to be a sentence about anything', () => {
    const edited = sources();
    edited[0]!.quote = 'the pod';
    const result = run(['--cases', corpus({ entry: { sources: edited } })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('quote shorter than 12 characters');
  });

  it('refuses a source whose layer is not one of the four', () => {
    const edited = sources();
    edited[2]!.layer = 'timeline';
    const result = run(['--cases', corpus({ entry: { sources: edited } })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("layer 'timeline', which is not one of entity / fault / process / evidence");
  });

  it('refuses a quote with no statement of what it supports', () => {
    const edited = sources();
    edited[3]!.why = 'because';
    const result = run(['--cases', corpus({ entry: { sources: edited } })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('quotes for evidence without saying what it supports');
  });

  it('refuses an entry that cites no sources at all', () => {
    const result = run(['--cases', corpus({ entry: { sources: [] } })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('cites no sources');
  });
});

describe('check-fault-cases · the case is also held to L2, not only to its four layers', () => {
  // Finding 233: `assessFourLayer` answers "are the layers filled", not "is this a case". The
  // corpus carried three cases whose timestamps were `...:00Z` -- canonical to a human and not to
  // `checkG1Structural`, which requires milliseconds. Nothing noticed, because the guard had never
  // asked G1 anything. These two tests are the ask.

  it('refuses a timestamp that is not canonical UTC ISO-8601', () => {
    const dir = corpus({
      mutate: (faultCase) => {
        faultCase.injectTime = '2026-09-14T02:03:00Z';
      },
    });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('fails the L2 structural contract: injectTime must be canonical UTC ISO-8601');
    expect(result.out).toContain("got '2026-09-14T02:03:00Z'");
  });

  it('refuses an onset that falls outside its own declared window', () => {
    // A four-layer complete case with `injectTime` after `window.end` passes every check in
    // `assessFourLayer` and is a case no evaluator can score.
    const dir = corpus({
      mutate: (faultCase) => {
        const window = faultCase.window as Record<string, unknown>;
        window.start = '2026-09-14T03:00:00.000Z';
        window.end = '2026-09-14T04:00:00.000Z';
      },
    });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('injectTime falls outside the declared window');
  });
});

describe('check-fault-cases · the units in a checkpoint have to exist', () => {
  // The second half of L2 that this guard did not ask for. Two of the three cases carried units a
  // person writes and the conversion table does not have: `m` for millicores, `messages` for a
  // lag, `x` for a multiple. Nothing downstream could ever convert them, and nothing noticed
  // until G2 was asked.
  it('refuses a checkpoint whose unit is not in the conversion table', () => {
    const dir = corpus({
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
        checkpoints[0]!.unit = 'messages';
      },
    });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("fails the L2 reference contract: checkpoint 'cp-cpu-limit' uses unknown unit 'messages'");
  });

  it('refuses a causal step that the topology does not connect', () => {
    // The step is annotated, the entities exist, and the graph has no path between them -- a
    // chain that reads as propagation and cannot be walked.
    // The chain stays continuous -- step 2 starts where step 1 ended -- and the topology has no
    // edge in that direction: the graph says checkout-api *calls* payment-service, not the
    // reverse. A chain that reads as propagation and cannot be walked is what G2 is for; the
    // break-in-continuity check fires before it, which is why this edit keeps the steps joined.
    const dir = corpus({
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        const chain = truth.causalChain as Array<Record<string, unknown>>;
        // `cart-service` is in the graph and in a different connected component: the edges run
        // checkout-api -> its pod -> its container, and separately cart-service -> inventory.
        chain[0]!.toEntityId = 'service:synthetic-storefront/cart-service';
        chain[1]!.fromEntityId = 'service:synthetic-storefront/cart-service';
        chain[1]!.toEntityId = 'pod:synthetic-storefront/checkout-api-0';
      },
    });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('asserts propagation with no path in the topology');
  });
});

describe('check-fault-cases · derived telemetry is a claim G3 can refuse', () => {
  // The step that changes what the corpus is: without signals a case is an annotation, and with
  // them G1's signal rules, G2's window rule and G3's anomaly rule all have something to judge.
  // The values are derived from the two numbers the text states -- so the same quote mechanism
  // holds them -- and the series is constructed, which is why the report says "derived".
  const REAL_SIGNALS = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  function signals(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(REAL_SIGNALS)) as Record<string, unknown>;
  }

  function seriesOf(declaration: Record<string, unknown>): Array<Record<string, unknown>> {
    return declaration.series as Array<Record<string, unknown>>;
  }

  it('accepts the shipped declaration and says how many cases carry telemetry', () => {
    const dir = corpus({ signals: signals() });
    const result = run(['--cases', dir]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain(
      '1 of 1 also carry telemetry whose provenance is declared, which passes G3, and which the peak-z baseline locates in its top-K',
    );
  });

  it('refuses a series with no anomaly in it', () => {
    // Both series flat: the case still has four layers, resolves, and quotes its text, and G3
    // says the telemetry carries no fault. This is the assertion that proves the gate is running
    // rather than skipping a case with no metrics.
    const edited = signals();
    for (const one of seriesOf(edited)) {
      one.post = one.baseline;
    }
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('signals fail G3: no metric sustains |Z| >= 2 for 3 samples after injection');
  });

  it('refuses a derived value whose quote is not in the incident text', () => {
    const edited = signals();
    seriesOf(edited)[0]!.quote = '180ms to 4.4s';
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('derives \'request_duration_p99_ms\' from a quote the incident text does not contain');
  });

  it('refuses a declaration that names another case', () => {
    const edited = signals();
    edited.caseId = 'history-something-else';
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("names signals for 'history-something-else'");
  });

  it('refuses an empty series', () => {
    const edited = signals();
    edited.series = [];
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('declares an empty signal series');
  });
});

describe('check-fault-cases · G5 is asked of every case, because it needs no telemetry', () => {
  it('refuses a case that does not isolate its answer key', () => {
    // `answerKeyIsolated` is a claim the case makes about itself, and until this round nothing
    // read it. A case whose answer key sits beside its query is a case whose oracle is the payload.
    const dir = corpus({
      mutate: (faultCase) => {
        faultCase.answerKeyIsolated = false;
      },
    });
    const result = run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('fails the anti-pollution gate');
  });
});

describe('check-fault-cases · provenance is a closed vocabulary, not a sentence', () => {
  // The report says which cases carry *derived* signals, and a reader decides how much to trust a
  // number on the strength of that word. A free string would let a case claim anything that reads
  // well, so the field is one of two values and anything else is refused.
  const REAL_SIGNALS = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  function signals(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(REAL_SIGNALS)) as Record<string, unknown>;
  }

  it('refuses a provenance that is neither derived nor captured', () => {
    const edited = signals();
    edited.provenance = 'measured';
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("declares provenance 'measured', which is neither 'derived' nor 'captured'");
  });

  it('accepts captured, which nothing uses yet and the schema must still admit', () => {
    // The value exists for the case that is eventually collected from a deployment. A vocabulary
    // with one member would make the word "derived" unfalsifiable.
    const edited = signals();
    edited.provenance = 'captured';
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status, result.out).toBe(0);
  });
});

describe('check-fault-cases · G4, the last gate that needed a run rather than a derivation', () => {
  // G4 reads outcomes, so asking it of the corpus required a localiser. `fault/baseline-localiser.ts`
  // is that run: peak |z| per service against its own baseline, ranked, with the answer key never
  // read. These tests are the gate's side of it -- the case must be *solvable*, and a case whose
  // anomaly belongs to a service nobody annotated is the one that is not.
  // The checkout declaration, because the scratch corpus writes the checkout case: a declaration
  // names its case and the guard refuses a mismatch, which is its own test above.
  const REAL_SIGNALS = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  function signals(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(REAL_SIGNALS)) as Record<string, unknown>;
  }

  it('accepts a case whose own service carries the anomaly the baseliner finds', () => {
    const result = run(['--cases', corpus({ signals: signals() })]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('1 of 1 also carry telemetry');
    expect(result.out).toContain('the peak-z baseline locates in its top-K');
  });

  it('refuses a case whose anomaly belongs to a service the annotation does not name', () => {
    // The signals stay anomalous, so G3 passes; the ranking is built from them, so the annotated
    // component is nowhere in it and G4 refuses. This is the shape of a case that reads as valid
    // and cannot be scored, which is exactly what the gate is for.
    const edited = signals();
    for (const one of (edited.series as Array<Record<string, unknown>>)) {
      one.service = 'somebody-else';
    }
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('is not solvable by the peak-z-by-service baseline');
    expect(result.out).toContain('only 0 baseline(s) locate the root cause within top-K');
  });
});
