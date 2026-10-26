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
    expect(result.out).toContain('10 of 30 sample(s) carry a four-layer case');
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

  it('refuses a fault type that disagrees with the sample the case is annotated from', () => {
    // Finding 255. The corpus is two documents -- an extraction key of thirty samples and a set of
    // four-layer annotations -- joined by one string, and nothing compared them: the key says what the
    // fault is and the annotation says what the case ran, and a disagreement between the two would
    // have left the benchmark scoring an answer the key does not ask for.
    const result = run([
      '--cases',
      corpus({
        mutate: (faultCase) => {
          (faultCase.fault as Record<string, unknown>).type = 'memory-saturation';
        },
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares fault type 'memory-saturation', and the sample it is annotated from expects 'cpu-saturation'",
    );
  });

  it('refuses a category that disagrees with the sample', () => {
    const result = run([
      '--cases',
      corpus({
        mutate: (faultCase) => {
          (faultCase.fault as Record<string, unknown>).category = 'code';
        },
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares category 'code', and the sample it is annotated from expects 'resource'",
    );
  });

  it('refuses a root cause component that disagrees with the sample', () => {
    // The one that matters most: the component is the answer a solver has to name, so a case whose
    // truth is a different component from the key's is a case with two answers.
    const result = run([
      '--cases',
      corpus({
        mutate: (faultCase) => {
          (faultCase.groundTruth as Record<string, unknown>).rootCauseComponent = 'payment-service';
        },
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares root cause component 'payment-service', and the sample it is annotated from " +
        "expects 'checkout-api'",
    );
  });

  it('accepts the corpus, where every case agrees with its sample', () => {
    const result = run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
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
      '1 of 1 also carry telemetry whose origin is declared, which passes G3, and which both the peak-z and the median-shift baselines place in their top-K',
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

describe('check-fault-cases · origin is a closed vocabulary, not a sentence', () => {
  // The report says which cases carry *derived* signals, and a reader decides how much to trust a
  // number on the strength of that word. A free string would let a case claim anything that reads
  // well, so the field is one of two values and anything else is refused.
  //
  // The field is called `origin` because the repository already publishes a `provenance`
  // (`PROVENANCE_SOURCES`: direct / derived / inferred / defaulted) about how a single value was
  // obtained. Reusing the word for a two-member axis about a whole series would make `derived` mean
  // two things in two files, and `captured` is not a member of the published set.
  const REAL_SIGNALS = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  function signals(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(REAL_SIGNALS)) as Record<string, unknown>;
  }

  it('refuses an origin that is neither derived nor captured', () => {
    const edited = signals();
    edited.origin = 'measured';
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("declares origin 'measured', which is neither 'derived' nor 'captured'");
  });

  it('refuses the old field name instead of reading it as no origin at all', () => {
    // A declaration that still says `provenance` would otherwise arrive with no `origin`, and the
    // guard would report a vocabulary error about an empty string -- a message pointing at the value
    // when the thing that has to move is the key.
    const edited = signals();
    edited.provenance = edited.origin;
    delete edited.origin;
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("declares 'provenance'; the signals field is 'origin'");
  });

  it('accepts captured, which nothing uses yet and the schema must still admit', () => {
    // The value exists for the case that is eventually collected from a deployment. A vocabulary
    // with one member would make the word "derived" unfalsifiable.
    const edited = signals();
    edited.origin = 'captured';
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
    expect(result.out).toContain('both the peak-z and the median-shift baselines place in their top-K');
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
    expect(result.out).toContain('is not solvable by both baselines');
    // The message names both ranks, because "not solvable" is a claim about two runs and a reader
    // has to be able to see which one objected.
    expect(result.out).toContain('peak-z-by-service=absent, median-shift-by-service=absent');
    expect(result.out).toContain('only 0 baseline(s) locate the root cause within top-K');
  });
});

describe('check-fault-cases · two baselines, and the shape that separates them', () => {
  // G4 with one solver asks whether a method agrees with the construction it was pointed at. With
  // `minSolvers: 2` it asks whether the case is locatable by two methods that fail differently --
  // and the only way to know the second solver is being consulted rather than counted is a case
  // that exactly one of them solves.

  /** The four sentences the checkout text offers, each attached to one declared series. */
  function spikeCase(): Record<string, unknown> {
    return {
      schema: 'rca-bench-derived-signals/1',
      caseId: 'history-checkout-cpu-saturation',
      origin: 'derived',
      why:
        'A declaration built to separate the two baselines: the root cause carries a spike and ' +
        'three other services carry steps, so peak-z ranks the truth first and a median shift ' +
        'ranks it last.',
      series: [
        {
          service: 'checkout-api',
          metric: 'request_duration_p99_ms',
          unit: 'ms',
          baseline: 180,
          post: 4300,
          derivation: 'spike',
          quote: '180ms to 4.3s',
          why: 'the annotation, carrying the fault as a brief excursion rather than a step',
        },
        {
          service: 'checkout-api-0',
          metric: 'container_cpu_throttled_seconds_total',
          unit: 's',
          baseline: 12,
          post: 96,
          derivation: 'counter',
          quote: 'the pod sat pinned at its 500m limit',
          why: 'the mechanism, as a counter that accumulates',
        },
        {
          service: 'payment-service',
          metric: 'error_rate_percent',
          unit: '%',
          baseline: 1,
          post: 3,
          quote: 'No error rate change in the downstream payment service',
          why: 'a step on a service that is not the root cause',
        },
        {
          service: 'load-generator',
          metric: 'request_rate_rps',
          // `rps`, not `1`. This fixture declared a rate of 100 in the dimensionless ratio unit, which
          // G2 accepted -- `1` is a published unit -- until the bounds rule asked what a reading in
          // `1` can be and found that 100 is not one (finding 252). The clamp then flattened the
          // series to 1 and the negative control stopped being one, which is how the fixture's own
          // modelling error surfaced.
          unit: 'rps',
          baseline: 100,
          post: 300,
          quote: 'The load generator was unchanged from the previous week',
          why: 'a second step, so that the ranking has four services and top-K is three',
        },
      ],
    };
  }

  it('refuses a case that only the spike-sensitive baseline can locate', () => {
    // The negative control for `minSolvers: 2`. The spike is the root cause's only evidence: peak-z
    // sees it, the median of the window does not, so the robust ranking places `checkout-api` fourth
    // of four -- outside a top-K of three -- and the case is refused. Under one solver it would pass.
    //
    // `peak-z-by-service=2` rather than 1 is the counter's doing, and it is a consequence of finding
    // 249: the throttling counter's pre-window is now flat at its baseline, so its baseline has no
    // spread at all, the `epsilon` floor turns its rise into an enormous z, and the *pod* that carries
    // it (`checkout-api-0`, a different `service.name`) outranks the service. The case is still
    // refused for the reason the test is about; the number moved because a claim the expansion used
    // to invent -- a rate before the fault -- was removed.
    const result = run(['--cases', corpus({ signals: spikeCase() })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('is not solvable by both baselines');
    expect(result.out).toContain('peak-z-by-service=2, median-shift-by-service=4');
  });

  it('refuses a noise value outside the vocabulary', () => {
    // Finding 254. The field decides whether a reading is exact, so a typo must not be read as
    // `sampled`: `"none "` would otherwise produce a jittered series that reads as exact.
    const edited = spikeCase();
    (edited.series as Array<Record<string, unknown>>)[0]!.noise = 'samppling';
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares noise 'samppling' for 'request_duration_p99_ms', which is not one of sampled / none",
    );
  });

  it('refuses a noise claim on a counter, because a counter is already exact', () => {
    // Two ways to say one thing is one too many: a counter's samples are its accumulation and carry no
    // noise either way, so the field beside it says nothing and would let a reader believe it did.
    const edited = spikeCase();
    (edited.series as Array<Record<string, unknown>>)[1]!.noise = 'none';
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares noise for 'container_cpu_throttled_seconds_total', which is a counter -- its samples are exact either way",
    );
  });

  it('refuses a derivation outside the vocabulary instead of treating it as a step', () => {
    // The first version of the expansion tested `derivation === 'counter'` and let everything else
    // mean `step`, so `"counters"` would have produced a step series silently -- a file that reads
    // as a counter and expands as a level.
    const edited = spikeCase();
    (edited.series as Array<Record<string, unknown>>)[1]!.derivation = 'counters';
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares derivation 'counters' for 'container_cpu_throttled_seconds_total', which is not one of step / counter / spike",
    );
  });
});

describe('check-fault-cases · the corpus through the coverage report and the exporter', () => {
  // Neither number existed before finding 238. The coverage report was only ever handed bundles
  // bound for official scoring, and the exporter only ever saw datasets that already carried the
  // modalities it writes. Asked of the annotated corpus, the two disagree: coverage says RE2 is
  // degraded for want of a log, and the exporter writes RE2's `logs.csv` and `traces.csv` anyway.
  const REAL_SIGNALS = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  function signals(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(REAL_SIGNALS)) as Record<string, unknown>;
  }

  it('prints what the coverage report says about each suite the corpus could be exported to', () => {
    const result = run(['--cases', corpus({ signals: signals() })]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain(
      'coverage rcaeval-re1 ready · rcaeval-re2 degraded (no log) · rcaeval-re3 degraded (no log, trace)',
    );
  });

  it('prints how many exported files exist with no data in them', () => {
    // Two per case for RE2: `logs.csv` and `traces.csv`, header only. `metrics.json` is one line of
    // JSON and `inject_time.txt` is one line by design, so neither is counted -- the first version
    // counted lines and reported RE1 as three empty files when it was writing real data.
    const result = run(['--cases', corpus({ signals: signals() })]);
    expect(result.out).toContain('export RE1 1 case(s) written, 0 file(s) with no rows');
    expect(result.out).toContain('RE2 1 case(s) written, 2 file(s) with no rows');
    expect(result.out).toContain('RE3 0 case(s) written, 0 file(s) with no rows, 1 skipped');
  });

  it('says nothing about coverage when no case carries telemetry, rather than reporting zeroes', () => {
    // A corpus with no signals has no coverage to report, and printing `0%` for every modality would
    // be a measurement of nothing. The line is absent, which is the honest form of "not asked".
    const result = run(['--cases', corpus({})]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).not.toContain('check-fault-cases: coverage');
    expect(result.out).not.toContain('check-fault-cases: export');
  });
});

describe('check-fault-cases · a log line, which is the first modality a metric could not supply', () => {
  // RE2 writes a `logs.csv`, and every one this corpus produced had a header and no rows until
  // finding 239. A log has no baseline and no threshold, so the only thing that holds it to the
  // incident is the quote -- the same rule the four layers use, applied to the one modality where
  // the body is necessarily a reconstruction.
  //
  // The three refusals below edit the *checkout* declaration, because the scratch corpus writes the
  // checkout case: a ledger declaration passed with a checkout case would also be refused, by the
  // caseId check, and the test would pass for a reason it did not name.
  const CHECKOUT = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  /** The checkout declaration with one log line appended, quoting its own text. */
  function withLog(edit: (line: Record<string, unknown>) => void): Record<string, unknown> {
    const copy = JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown>;
    const line: Record<string, unknown> = {
      id: 'throttling-line',
      service: 'checkout-api-0',
      severity: 'WARN',
      body: 'cpu throttling counters climbed for eleven minutes; the pod sat at its limit',
      quote: 'Container CPU throttling counters climbed the whole time',
      why: 'the only place the throttling is stated, and it is stated as a condition rather than a spike',
    };
    edit(line);
    copy.logs = [line];
    return copy;
  }

  it('accepts the shipped log line, because it quotes the broker and not the author', () => {
    const result = run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
    // One case of four now fills a `logs.csv`, which is why RE2 stops being degraded.
    expect(result.out).toContain('rcaeval-re2 ready');
    // Six, not seven: the cart case's two spans fill one `traces.csv` (finding 240).
    expect(result.out).toContain('RE2 10 case(s) written, 14 file(s) with no rows');
  });

  it('accepts a log line whose quote is in its own case text', () => {
    const result = run(['--cases', corpus({ signals: withLog(() => undefined) })]);
    expect(result.status, result.out).toBe(0);
  });

  it('refuses a log body whose quote is not in the incident text', () => {
    const result = run([
      '--cases',
      corpus({
        signals: withLog((line) => {
          line.quote = 'Container CPU throttling counters fell the whole time';
        }),
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('derives a log line from a quote the incident text does not contain');
  });

  it('refuses a log body too short to be a line', () => {
    const result = run([
      '--cases',
      corpus({
        signals: withLog((line) => {
          line.body = 'throttled';
        }),
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('declares a log body shorter than twelve characters');
  });

  it('refuses a log line that does not say what it supports', () => {
    const result = run([
      '--cases',
      corpus({
        signals: withLog((line) => {
          line.why = 'because';
        }),
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('declares a log line without saying what it supports');
  });
});

describe('check-fault-cases · a span, which is the last modality and the only one with a parent', () => {
  // A span has a start, a duration and a parent, and the cart case states both of its durations --
  // 900ms on the caller and 11ms in the callee -- so the pair is quoted rather than invented. What
  // the parent adds is the property a metric and a log cannot express: that the 11ms sits *inside*
  // the 900ms, which is what makes the difference the time on the wire.
  const CHECKOUT = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  /** The checkout declaration with one span pair, quoting its own text. */
  function withTraces(edit: (spans: Array<Record<string, unknown>>) => void): Record<string, unknown> {
    const copy = JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown>;
    const spans: Array<Record<string, unknown>> = [
      {
        service: 'checkout-api',
        spanName: 'POST /checkout',
        durationMs: 4300,
        quote: '180ms to 4.3s',
        why: 'the caller span, which carries the whole change the pager fired on',
      },
      {
        service: 'checkout-api-0',
        spanName: 'render_cart',
        durationMs: 500,
        parent: 'POST /checkout',
        quote: 'the pod sat pinned at its 500m limit',
        why: 'a child span, so that the parent holds the total and the child holds one hop',
      },
    ];
    edit(spans);
    copy.traces = spans;
    return copy;
  }

  it('makes the coverage report call every suite ready, which it never could before', () => {
    const result = run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('rcaeval-re3 ready');
  });

  it('accepts a parent that names a span in the same file, and fills traces.csv', () => {
    const result = run(['--cases', corpus({ signals: withTraces(() => undefined) })]);
    expect(result.status, result.out).toBe(0);
    // One data-less file for this case, and it is `logs.csv`: the spans were emitted, so
    // `traces.csv` has rows. That is the whole point of the modality -- a file that used to be a
    // header now carries the two spans the incident text states.
    expect(result.out).toContain('RE2 1 case(s) written, 1 file(s) with no rows');
  });

  it('refuses a span whose quote is not in the incident text', () => {
    const result = run([
      '--cases',
      corpus({
        signals: withTraces((spans) => {
          spans[0]!.quote = '180ms to 5.3s';
        }),
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('derives a span from a quote the incident text does not contain');
  });

  it('refuses a duration of zero, which is a span that did not happen', () => {
    const result = run([
      '--cases',
      corpus({
        signals: withTraces((spans) => {
          spans[1]!.durationMs = 0;
        }),
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("declares span 'render_cart' with a duration of 0");
  });

  it('refuses a parent that names no span in the file', () => {
    // A row whose parent id belongs to nothing is a span an exporter writes and no reader can
    // assemble, which is worse than a missing row because it looks complete.
    const result = run([
      '--cases',
      corpus({
        signals: withTraces((spans) => {
          spans[1]!.parent = 'POST /nothing';
        }),
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("whose parent 'POST /nothing' is not declared in the same file");
  });

  it('refuses a span that does not say what it supports', () => {
    const result = run([
      '--cases',
      corpus({
        signals: withTraces((spans) => {
          spans[0]!.why = 'because';
        }),
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('declares a span without saying what it supports');
  });
});

describe('check-fault-cases · the first code-level case', () => {
  it('writes an RE3 case, which no annotation could do before', () => {
    // RE3 selects on `category === 'code'`, and the corpus had none: four cases of resource,
    // network and middleware. The fifth is an uncaught exception in a CSV writer, so the suite that
    // had always reported `0 case(s) written, 4 skipped` now writes one -- and the reason its
    // `traces.csv` is empty is that the text states no duration, which is printed rather than
    // hidden.
    const result = run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('RE3 2 case(s) written, 3 file(s) with no rows, 8 skipped');
  });
});

describe('check-fault-cases · a checkpoint says what its reference is a reference to', () => {
  // One optional string used to carry four different things and nothing resolved it: eight of eleven
  // checkpoints named a series that did not exist (finding 243). `signalKind` separates them, and
  // each kind has the rule that can be applied to it.
  const CHECKOUT = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  /** The checkout declaration with one checkpoint edited, which is the case the scratch corpus writes. */
  function withCheckpoint(edit: (checkpoint: Record<string, unknown>) => void): string {
    return corpus({
      signals: JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown>,
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
        edit(checkpoints.find((one) => one.checkpointId === 'cp-p99')!);
      },
    });
  }

  it('resolves every reference in the corpus by its own kind', () => {
    const result = run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
    // Twelve of twelve: eight name a series, two are derived and read four readings between them
    // (one of the two reads two points of one series), one names a log line by id, and one is a
    // configuration fact that names no series at all. Ten are comparable, and all ten hold.
    expect(result.out).toContain(
      'checkpoints 29 of 29 reference(s) resolve by kind (23 over a series, 2 of them computed from ' +
        '4 reading(s), 3 citing a declared configuration fact); 0 of 26 comparable assertion(s) fail',
    );
  });

  it('refuses a series reference the signals file does not declare', () => {
    const result = run(['--cases', withCheckpoint((cp) => { cp.signalRef = 'request_duration_p99'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("checkpoint 'cp-p99' names 'request_duration_p99', which the signals file does not declare");
    expect(result.out).toContain('it declares: request_duration_p99_ms, container_cpu_throttled_seconds_total');
  });

  it('refuses a checkpoint whose unit disagrees with its series', () => {
    const result = run(['--cases', withCheckpoint((cp) => { cp.unit = 's'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("is in 's' but the series 'request_duration_p99_ms' is in 'ms'");
  });

  it('refuses a checkpoint its own series fails', () => {
    // The defect that only a resolved reference can reveal: `>` against a value equal to the post.
    const result = run(['--cases', withCheckpoint((cp) => { cp.comparator = '>'; cp.value = 4300; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("asserts request_duration_p99_ms > 4300, and the series' post value is 4300");
  });

  it('refuses a configuration fact that names a series', () => {
    // Two statements of one value, one of which the guard would start comparing with telemetry.
    const result = run(['--cases', withCheckpoint((cp) => { cp.signalKind = 'configuration'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("checkpoint 'cp-p99' calls 'request_duration_p99_ms' a configuration fact");
  });

  it('refuses a log reference that matches no declared line', () => {
    const result = run(['--cases', withCheckpoint((cp) => { cp.signalKind = 'log'; cp.signalRef = 'nothing'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("checkpoint 'cp-p99' names log 'nothing', which the signals file does not declare");
  });

  it('refuses a checkpoint with no reference at all', () => {
    const result = run(['--cases', withCheckpoint((cp) => { delete cp.signalRef; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("checkpoint 'cp-p99' names no signal, so nothing carries it");
  });

  it('refuses a signal kind outside the vocabulary, and the schema does it', () => {
    // `signalKind` is a published vocabulary in `ir/types.ts`, so a bad member fails the parse --
    // exit 1, "could not be read as a FaultCase" -- rather than the guard's own check. The guard had
    // a membership test for one round after the schema gained the enum, and it was unreachable: an
    // unrecognised kind never reached it. Deleted rather than kept as a second opinion.
    const result = run(['--cases', withCheckpoint((cp) => { cp.signalKind = 'telemetry'; })]);
    expect(result.status).toBe(1);
    expect(result.out).toContain('could not be read as a FaultCase');
    // The message carries the field and the reason -- `describeSchemaFailure` composes it, because
    // the first line of a zod issue list is `[` and that was the whole diagnosis for every refusal.
    expect(result.out).toContain('signalKind: Invalid enum value.');
  });

  it('refuses a log line with no id, because nothing can reference it', () => {
    const edited = JSON.parse(readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8')) as Record<string, unknown>;
    edited.logs = [{ service: 'checkout-api-0', body: 'throttled for eleven minutes', quote: 'Container CPU throttling counters climbed the whole time', why: 'a line with no id is a line no checkpoint can name' }];
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('declares a log line with no id, which nothing can reference');
  });
});

describe('check-fault-cases · a derived checkpoint states the arithmetic it claims', () => {
  // Finding 245. `cp-processing-tripled` asserted `== 3` over a series whose post value is `0.06`,
  // because the 3 was `0.06 / 0.02` and the divisor appeared nowhere in the annotation. The guard
  // could only check that the series existed. Now the expression is the reference and the number is
  // checked against what the expression computes -- so the tests below are about a *value*, not
  // about a field being present.
  const CHECKOUT = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  /** The p99 checkpoint turned into a derived one, with the caller's expression and value. */
  function derived(
    expression: unknown,
    options: { value?: unknown; unit?: unknown; comparator?: string; extra?: Record<string, unknown> } = {},
  ): string {
    return corpus({
      signals: JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown>,
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
        const checkpoint = checkpoints.find((one) => one.checkpointId === 'cp-p99')!;
        delete checkpoint.signalRef;
        checkpoint.signalKind = 'derived';
        checkpoint.expression = expression;
        checkpoint.value = options.value ?? 4120;
        checkpoint.unit = options.unit ?? 'ms';
        // `cp-p99` is a `>=` threshold; the derived shape here is an equality, so the comparison is
        // stated rather than inherited -- otherwise `4120 >= 4100` would hold and the test that
        // means to prove a wrong value is refused would pass for the wrong reason.
        checkpoint.comparator = options.comparator ?? '==';
        Object.assign(checkpoint, options.extra ?? {});
      },
    });
  }

  it('accepts a derived checkpoint that computes what the data says', () => {
    // 4300ms at the post onset, 180ms at the baseline, both declared beside the sentence that states
    // them: the difference is 4120ms and the annotation now has to say so in arithmetic.
    const result = run(['--cases', derived('request_duration_p99_ms.post - request_duration_p99_ms.baseline')]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('1 of them computed from 2 reading(s)');
  });

  it('refuses a stated value the expression does not produce', () => {
    const result = run([
      '--cases',
      derived('request_duration_p99_ms.post - request_duration_p99_ms.baseline', { value: 4100 }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "checkpoint 'cp-p99' asserts 'request_duration_p99_ms.post - request_duration_p99_ms.baseline' == 4100, " +
        'and it computes to 4120',
    );
  });

  it('reports a computed value at twelve significant digits, not seventeen', () => {
    // `4300 / 180` is 23.88888888888889. Printing all of it makes an author hunt for a difference
    // that is not the one the message is about.
    const result = run([
      '--cases',
      derived('request_duration_p99_ms.post / request_duration_p99_ms.baseline', { value: 24, unit: '1' }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('and it computes to 23.8888888889');
  });

  it('refuses a computed value stated in the wrong unit', () => {
    const result = run([
      '--cases',
      derived('request_duration_p99_ms.post / request_duration_p99_ms.baseline', { value: 23.8888888889, unit: 'ms' }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("computes 'request_duration_p99_ms.post / request_duration_p99_ms.baseline' to a value in '1', but states 'ms'");
  });

  it('refuses arithmetic over a metric the signals file does not declare', () => {
    const result = run(['--cases', derived('request_duration_p99_ms.post - request_duration_p99_ms.median')]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("reads the point 'median' at character 55, which is not one of baseline, post");
  });

  it('adds two units the table can convert, and reports the sum in the left one', () => {
    // The first version of this test asserted that `ms + s` was refused. It was wrong: the units are
    // both durations, `util/unit.ts` holds the factor, and a refusal of a legitimate conversion is a
    // false rejection rather than a check (finding 246). What the guard has to prove end to end is
    // that the conversion reaches the *stated value*: 4.3s plus eleven minutes is 664,300ms.
    const signals = JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown> & {
      series: Array<Record<string, unknown>>;
    };
    signals.series.push({
      service: 'checkout-api',
      metric: 'window_duration_minutes',
      unit: 'min',
      baseline: 11,
      post: 11,
      quote: 'over eleven minutes',
      why: 'the sentence states the window, and the window is a duration in another unit',
    });
    const result = run([
      '--cases',
      corpus({
        signals,
        mutate: (faultCase) => {
          const truth = faultCase.groundTruth as Record<string, unknown>;
          const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
          const checkpoint = checkpoints.find((one) => one.checkpointId === 'cp-p99')!;
          delete checkpoint.signalRef;
          checkpoint.signalKind = 'derived';
          checkpoint.expression = 'request_duration_p99_ms.post + window_duration_minutes.post';
          checkpoint.comparator = '==';
          checkpoint.value = 664300;
          checkpoint.unit = 'ms';
        },
      }),
    ]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('0 of 3 comparable assertion(s) fail');
  });

  it('refuses a derived checkpoint with no expression, and says which field is missing', () => {
    const dir = derived('request_duration_p99_ms.post');
    const text = readFileSync(join(dir, 'case.json'), 'utf8');
    const edited = JSON.parse(text) as Record<string, unknown>;
    const truth = edited.groundTruth as Record<string, unknown>;
    const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
    delete checkpoints.find((one) => one.checkpointId === 'cp-p99')!.expression;
    writeFileSync(join(dir, 'case.json'), `${JSON.stringify(edited, null, 2)}\n`);
    const result = run(['--cases', dir]);
    expect(result.status).toBe(1);
    expect(result.out).toContain('expression: a derived checkpoint states the arithmetic that produces its value');
  });

  it('refuses a derived checkpoint that also names one series', () => {
    const result = run([
      '--cases',
      derived('request_duration_p99_ms.post - request_duration_p99_ms.baseline', {
        extra: { signalRef: 'request_duration_p99_ms' },
      }),
    ]);
    expect(result.status).toBe(1);
    expect(result.out).toContain('signalRef: a derived checkpoint is referenced by its expression');
  });

  it('refuses an expression on a checkpoint that is not derived', () => {
    // One field with one meaning: a series checkpoint carrying arithmetic would be a second statement
    // of how its number was obtained, which nothing would compare.
    const result = run([
      '--cases',
      corpus({
        signals: JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown>,
        mutate: (faultCase) => {
          const truth = faultCase.groundTruth as Record<string, unknown>;
          const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
          checkpoints.find((one) => one.checkpointId === 'cp-p99')!.expression = 'request_duration_p99_ms.post';
        },
      }),
    ]);
    expect(result.status).toBe(1);
    expect(result.out).toContain("only a derived checkpoint carries an expression; this one is 'series'");
  });

  it('refuses two series with one name, because a reference to it names neither', () => {
    const edited = JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown> & { series: Array<Record<string, unknown>> };
    edited.series.push({ ...edited.series[0]!, post: 1 });
    const result = run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("declares two series named 'request_duration_p99_ms', so a reference to it names neither");
  });

  it('counts a derived assertion among the comparable ones, and only one that resolves', () => {
    // The count is what makes the corpus's own line meaningful: a checkpoint that could not be
    // evaluated must not appear in the denominator as though it had been checked.
    const result = run(['--cases', derived('request_duration_p99_ms.post - request_duration_p99_ms.baseline', { value: 4100 })]);
    expect(result.out).toContain('1 of 3 comparable assertion(s) fail');
  });
});
describe('check-fault-cases · a configuration checkpoint cites a fact the case declares', () => {
  // Finding 247. The rule used to be negative -- "must not collide with a series" -- which caught a
  // modelling error and said nothing about whether the quota was the one the case ran under. Now the
  // reference names a key of `fault.parameters` and the comparison is against what that key holds.
  const CHECKOUT = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  /** The checkout case with its `cp-cpu-limit` checkpoint edited, and optionally its parameters. */
  function withConfiguration(
    edit: (checkpoint: Record<string, unknown>) => void,
    parameters?: (record: Record<string, unknown>) => void,
  ): string {
    return corpus({
      signals: JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown>,
      mutate: (faultCase) => {
        const fault = faultCase.fault as Record<string, unknown>;
        const declared = fault.parameters as Record<string, unknown>;
        parameters?.(declared);
        const truth = faultCase.groundTruth as Record<string, unknown>;
        const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
        edit(checkpoints.find((one) => one.checkpointId === 'cp-cpu-limit')!);
      },
    });
  }

  it('accepts the corpus checkpoint, which cites the injection\'s own parameter', () => {
    const result = run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
    // One of the twelve resolves to a declared configuration fact, and it is *comparable* -- the
    // denominator went from ten to eleven when it stopped being uncheckable.
    expect(result.out).toContain('3 citing a declared configuration fact');
    expect(result.out).toContain('0 of 26 comparable assertion(s) fail');
  });

  it('refuses a configuration fact the case does not declare, and names what it does', () => {
    // This is the defect itself: `container_spec_cpu_quota` is a plausible metric name that nothing
    // in the case declares, so the checkpoint was citing prose.
    const result = run(['--cases', withConfiguration((cp) => { cp.signalRef = 'container_spec_cpu_quota'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "calls 'container_spec_cpu_quota' a configuration fact, but fault.parameters declares no such key " +
        '(it declares: container, cpuLimit)',
    );
  });

  it('refuses a stated value the case does not declare', () => {
    const result = run(['--cases', withConfiguration((cp) => { cp.value = 600; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("asserts 'cpuLimit' == 600, and fault.parameters declares 500 mcore");
  });

  it('converts a checkpoint stated in another unit of the same dimension', () => {
    // 500 mcore is 0.5 cores, and the table says so: the checkpoint may state the quota in either
    // unit and the comparison is against the converted value.
    const result = run(['--cases', withConfiguration((cp) => { cp.unit = 'core'; cp.value = 0.5; })]);
    expect(result.status, result.out).toBe(0);
    // One case: three checkpoints, all comparable, none failing. The conversion is visible in the
    // fact that the assertion is counted at all -- `0.5 core` is compared with `500 mcore`.
    expect(result.out).toContain('1 citing a declared configuration fact); 0 of 3 comparable assertion(s) fail');
  });

  it('refuses a unit the table cannot convert into the declared one', () => {
    const result = run(['--cases', withConfiguration((cp) => { cp.unit = 's'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "is in 's' and 'cpuLimit' is declared in 'mcore', which are not the same unit and not convertible",
    );
  });

  it('refuses a unit beside a parameter that declares none', () => {
    // A unit nothing can check is a claim, not a fact: the parameter holds a bare number.
    const result = run([
      '--cases',
      withConfiguration(
        (cp) => {
          cp.signalRef = 'replicas';
          cp.unit = 'count';
          cp.value = 3;
        },
        (parameters) => {
          parameters.replicas = 3;
        },
      ),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "states 'count' for 'replicas', which fault.parameters declares without a unit",
    );
  });

  it('refuses a parameter cited without the unit it is declared in', () => {
    const result = run(['--cases', withConfiguration((cp) => { delete cp.unit; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("cites 'cpuLimit' without a unit, and fault.parameters declares it in 'mcore'");
  });

  it('refuses a string parameter, which is an identifier rather than a fact', () => {
    // `container == 'checkout-api-app'` restates the parameter in a second place, and the parameter is
    // already in the file.
    const result = run(['--cases', withConfiguration((cp) => { cp.signalRef = 'container'; cp.unit = '1'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "cites parameter 'container', whose value \"checkout-api-app\" is not a number or a { value, unit } quantity",
    );
  });
});

describe('check-fault-cases · a declared reading stays inside the range its unit admits', () => {
  // Finding 252. A share of exactly 1 -- "every request 503'd" -- used to come out of the expansion as
  // 1.02, and the annotation could not fix it: any value at or below 0.98 understates the sentence.
  // The clamp handles the noise; this rule handles the declaration, because `post: 120` in `%` is a
  // number no reading can be, and a corpus that accepted it would ship an impossible row.
  const CHECKOUT = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  /** The checkout signals plus a scratch series, with the fields the caller chooses. */
  function withSeries(fields: Record<string, unknown>): string {
    const signals = JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown> & {
      series: Array<Record<string, unknown>>;
    };
    signals.series.push({
      service: 'checkout-api',
      metric: 'scratch_reading',
      quote: 'No error rate change in the downstream payment service',
      why: 'a scratch series the bounds rule is asked about',
      ...fields,
    });
    return corpus({ signals });
  }

  it('refuses a share above 100 per cent, and says what the unit admits', () => {
    const result = run(['--cases', withSeries({ unit: '1', baseline: 0, post: 1.2 })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares post 1.2 for 'scratch_reading' in '1', and a reading in '1' lies in [0, 1]",
    );
    expect(result.out).toContain('FAILED — 1 problem(s)');
  });

  it('accepts a share of exactly 1, which is the sentence "every request failed"', () => {
    const result = run(['--cases', withSeries({ unit: '1', baseline: 0, post: 1 })]);
    expect(result.status, result.out).toBe(0);
  });

  it('refuses a negative duration, because a duration is not signed', () => {
    // The lower bound is a statement rather than a default: nothing in this table is a signed
    // quantity, so -1 ms is not a small duration, it is the wrong shape.
    const result = run(['--cases', withSeries({ unit: 'ms', baseline: -1, post: 4300 })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares baseline -1 for 'scratch_reading' in 'ms', and a reading in 'ms' lies in [0, ∞)",
    );
  });

  it('says nothing about a unit the table does not know, because it has no range to state', () => {
    // `MiB/s` is a compound the conversion table has no entry for. Refusing a reading in it would be
    // this rule inventing a bound, which is the failure mode it exists to prevent at the other end.
    const result = run(['--cases', withSeries({ unit: 'MiB/s', baseline: -5, post: 4 })]);
    // G2 refuses the unit itself, which is a different rule and the one that should speak here.
    expect(result.out).not.toContain('lies in');
  });
});
