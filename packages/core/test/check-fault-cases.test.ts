import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const SAMPLES = resolve(ROOT, 'golden-master', 'fault-extraction', 'samples.json');

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

/**
 * What the corpus currently holds, read rather than remembered.
 *
 * These three counts used to be literals in the assertions below, and every round that annotated
 * another case had to edit them -- so the assertions were measuring the author's memory of the
 * corpus rather than the guard's agreement with it. The number a report must carry is the number
 * the index carries; a report that says `14 of 30` while the index lists fifteen is the defect
 * these assertions exist for, and a literal cannot see it.
 */
const INDEX = JSON.parse(readFileSync(join(CASES, 'index.json'), 'utf8')) as {
  cases: Array<{ case?: string }>;
};
const CORPUS_SIZE = INDEX.cases.length;
const SAMPLE_COUNT = (
  JSON.parse(readFileSync(join(ROOT, 'golden-master', 'fault-extraction', 'samples.json'), 'utf8')) as {
    samples: unknown[];
  }
).samples.length;

/** Every case file the index names, parsed, so a count derived from the corpus is derived from its text. */
const CASE_FILES = INDEX.cases
  .map((entry) => entry.case)
  .filter((name): name is string => typeof name === 'string')
  .map((name) => JSON.parse(readFileSync(join(CASES, name), 'utf8')) as { fault?: { category?: string } });
const CODE_LEVEL_CASES = CASE_FILES.filter((one) => one.fault?.category === 'code').length;
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

/** The sample the real annotation was written from; every copy `corpusOf` makes is also from it. */
const FIRST_SAMPLE = (
  JSON.parse(readFileSync(SAMPLES, 'utf8')) as {
    samples: Array<{ id: string; incidentText: string; expected: unknown }>;
  }
).samples.find((one) => one.id === 'resource-cpu-saturation-checkout')!;

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
  /**
   * Whether to add the fixture's loud competitor. Default true; a test whose subject is a *different*
   * refusal turns it off, because a corpus that carries the competitor no longer fails the way the
   * test is about to check (an empty series stops being empty, and a flat corpus stops being flat).
   */
  competitor?: boolean;
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
    const declared = options.competitor === false ? options.signals : withLoudCompetitor(options.signals);
    writeFileSync(join(dir, 'signals.json'), `${JSON.stringify(declared, null, 2)}\n`);
  }
  for (const file of options.extraFiles ?? []) writeFileSync(join(dir, file), '{}\n');
  writeFileSync(join(dir, 'background-telemetry.json'), `${JSON.stringify(background(graph), null, 2)}\n`);
  return dir;
}

/**
 * The background traffic a corpus needs to be a corpus.
 *
 * Built from the graph the test wrote rather than from a fixture, because the guard requires the
 * background to be the system: an entry the graph does not hold is a series attributed to nothing,
 * and a service the graph holds and the background omits is a candidate that never competed. Both
 * directions are asserted in `background-telemetry.test.ts`; here the helper has to satisfy them or
 * every one of these tests fails for a reason it is not about.
 */
function background(graph: Record<string, unknown>): Record<string, unknown> {
  const entities = Array.isArray(graph.entities) ? graph.entities : [];
  const services = entities.filter((entity) => (entity as { kind?: string }).kind === 'service');
  return {
    schema: 'rca-bench-background-telemetry/1',
    why: 'Background traffic for this fixture, flat, one series per service in the graph it was given.',
    series: services.map((entity, index) => ({
      service: String((entity as { name?: string }).name),
      metric: 'request_rate',
      unit: 'rps',
      value: 100 + index,
    })),
  };
}

/**
 * The fixture's signals, plus one component that is louder than the case's own answer.
 *
 * A single-case corpus has to satisfy the corpus-level rule that a strictly louder, separate
 * component outranks the answer (`checkDiscrimination`). Without this series the fixture is a corpus
 * whose answer is the loudest thing -- or, for the checkout case, whose loudest thing is the pod
 * under the answer, which the rule counts as the same component and therefore as no displacement at
 * all. Every test in this file would then fail for a reason it is not about.
 *
 * `cart-service` because the case does not answer with it and it is not inside the answer; the
 * quote is one the case's own text carries, so the series is derivable like every other.
 */
function withLoudCompetitor(signals: Record<string, unknown>): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(signals)) as Record<string, unknown> & {
    series?: Array<Record<string, unknown>>;
  };
  copy.series = [
    ...(copy.series ?? []),
    {
      service: 'cart-service',
      metric: 'scratch_competitor',
      unit: 'count',
      baseline: 0,
      post: 50_000,
      quote: 'No error rate change in the downstream payment service',
      why: 'the fixture\'s loud competitor, so a one-case corpus still has a component that outranks its answer',
    },
  ];
  return copy;
}

/**
 * A corpus directory holding `count` copies of the real annotation, each with the same level.
 *
 * The copies share a `sampleId` because the sample is not what these tests are about; the case id
 * differs so the per-case checks treat them as separate entries. Written rather than derived from
 * `corpus()` because that helper writes one case, and the rule under test needs ten before it says
 * anything -- which is the whole reason it went unreached until the gate was split.
 */
function copyId(index: number): string {
  return `copy-${String(index)}`;
}

/**
 * Where a fixture's own sample key lives: beside its corpus directory, not inside it.
 *
 * The guard treats every `.json` in the corpus directory as a case it was not told about, which is
 * the rule that catches an annotation dropped into the tree without an index entry. A key is not a
 * case, so the convention is a sibling path rather than an exception in the guard.
 */
function keyOf(corpusDir: string): string {
  dirs.push(`${corpusDir}-samples.json`);
  return `${corpusDir}-samples.json`;
}

function corpusOf(count: number, difficulty?: 'L1' | 'L2' | 'L3' | 'L4'): string {
  const dir = workspace();
  writeFileSync(join(dir, 'graph.json'), `${JSON.stringify(REAL_GRAPH, null, 2)}\n`);
  const cases = [];
  for (let index = 0; index < count; index += 1) {
    const faultCase = JSON.parse(JSON.stringify(REAL_CASE)) as Record<string, unknown>;
    faultCase.caseId = `history-copy-${String(index)}`;
    // Overwrite rather than keep: the real annotation states a level, so a copy that inherits it
    // would make every ungraded corpus look graded.
    if (difficulty === undefined) delete faultCase.difficulty;
    else faultCase.difficulty = difficulty;
    const file = `case-${String(index)}.json`;
    writeFileSync(join(dir, file), `${JSON.stringify(faultCase, null, 2)}\n`);
    cases.push({
      caseId: faultCase.caseId,
      sampleId: copyId(index),
      case: file,
      graph: 'graph.json',
      why: WHY,
      sources: REAL_SOURCES,
    });
  }
  writeFileSync(
    join(dir, 'index.json'),
    `${JSON.stringify({ schema: 'rca-bench-fault-cases/2', min: count, cases }, null, 2)}\n`,
  );
  // A key of its own, with one sample per copy. The shipped key has thirty ids for thirty real
  // samples, so ten copies pointing at one of its ids is ten annotations of one sample -- which is
  // exactly the shape `fault/sample-coverage.ts` refuses, and refusing it here would be the rule
  // working rather than the fixture being wrong (finding 302). What these copies are is ten
  // carriers of a difficulty label, so each gets an id of its own and the same incident text.
  writeFileSync(
    keyOf(dir),
    `${JSON.stringify(
      {
        ...(JSON.parse(readFileSync(SAMPLES, 'utf8')) as Record<string, unknown>),
        samples: cases.map((entry, index) => ({
          id: copyId(index),
          incidentText: FIRST_SAMPLE.incidentText,
          expected: FIRST_SAMPLE.expected,
        })),
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(dir, 'background-telemetry.json'), `${JSON.stringify(background(REAL_GRAPH), null, 2)}\n`);
  return dir;
}

/**
 * The key a fixture brings with it.
 *
 * A directory that carries its own `samples.json` is a corpus that manufactures its own samples --
 * `corpusOf` does, because ten copies of one annotation need ten ids rather than ten annotations of
 * one id. Passing the shipped key to such a directory would compare the fixture against a sample
 * set it was not written from, and the rule that catches that is the coverage rule, which would be
 * right to fire and would be measuring the harness (finding 302).
 *
 * Explicit rather than defaulted: only a directory that has the file is treated this way, and the
 * file is the statement of intent.
 */
function withOwnKey(args: string[]): string[] {
  if (args[0] !== '--cases' || args[1] === undefined) return args;
  const own = `${args[1]}-samples.json`;
  return existsSync(own) ? [...args, '--samples', own] : args;
}

/**
 * Run the guard once, without holding the event loop.
 *
 * This file runs the guard **116 times**, one invocation per defect, and each
 * invocation is a node process. `spawnSync` was the obvious way to write it and it
 * made the file's whole duration a single block: a synchronous file never returns
 * to the event loop, so the stall gauge -- which exists to keep a worker able to
 * answer the main process -- measured 23 s on a fast runner and **55 s on a slow
 * one**, past its 45 s budget and into the 60 s bridge deadline it protects
 * (finding 297). Awaiting a child costs the same wall time and yields while it
 * runs, so the longest block becomes one invocation.
 */
async function run(args: string[]): Promise<{ status: number | null; out: string }> {
  const child = spawn(process.execPath, [SCRIPT, ...withOwnKey(args)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    out += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    out += chunk;
  });
  // `close`, not `exit`: it fires after the pipes have drained, so `out` is the
  // whole of what the guard said rather than the part that arrived first.
  const status = await new Promise<number | null>((done, fail) => {
    child.on('error', fail);
    child.on('close', (code) => done(code));
  });
  return { status, out };
}

describe('check-fault-cases · the corpus as it stands', () => {
  it('accepts the shipped corpus and reports how many samples carry a case', async () => {
    const result = await run([]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain(`${String(CORPUS_SIZE)} of ${String(SAMPLE_COUNT)} sample(s) carry a four-layer case`);
    expect(result.out).toContain('every reference resolves');
    expect(result.out).toContain('every layer quotes a sentence the incident text contains');
    expect(result.out).toContain('every case passes G1, G2 and G5 -- structure, references, units, and no leaked identifiers');
  });

  it('reports the shipped corpus as within its difficulty target, which the readout never said before', async () => {
    // The line is printed rather than gated, deliberately: a share is a property of the set, and a
    // rule that fails every run on something no label can repair teaches people to skip the line.
    // `difficulty-floor.test.ts` holds the same claim with an assertion, so the number a reader sees
    // in CI and the number the suite would refuse to lose are the same number.
    const result = await run([]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('within the target');
    expect(result.out, 'the L4 share is the one this corpus spent seven rounds without').not.toContain(
      'L4 share 0.000',
    );
  });

  it('accepts a corpus whose only case is the same one copied to a scratch directory', async () => {
    // The path is a parameter, so the guard is not pinned to one directory. This is also what
    // lets the negative cases below run without touching the repository.
    const result = await run(['--cases', corpus({})]);
    expect(result.status, result.out).toBe(0);
    // One, because the scratch corpus holds the one case the helper writes -- which is also what
    // proves the count is read from the directory it was given rather than from the repository.
    expect(result.out).toContain('1 of 30');
  });

  it('states no neighbour count in the background file, because nothing re-derives one', async () => {
    // The file's own justification said a case's anomaly had "seventeen quiet neighbours", and that
    // may have been true when it was written. By the round this test was added the file held more
    // than twenty series -- so the one number in it that a reader would take as a property of the
    // corpus was wrong, and it was wrong in the file that exists to make a ranking falsifiable. The
    // readout prints the width on every run, which is where a count belongs; prose that repeats it
    // is a second statement that nothing checks. Refused by shape rather than by value: any number
    // word or digit in front of the phrase, so a future author cannot restate it in a new spelling.
    const background = JSON.parse(readFileSync(join(CASES, 'background-telemetry.json'), 'utf8')) as {
      why: string;
      series: unknown[];
    };
    const numbers =
      '(?:\\b\\d+\\b|\\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\\b)';
    expect(background.why).not.toMatch(new RegExp(`${numbers}\\s+(?:[a-z-]+\\s+)?quiet\\s+neighbou?rs?`, 'i'));
    // And the claim it does make is the one the guard checks: one series per service the graph
    // holds, refused in both directions by `backgroundProblems`.
    expect(background.series.length).toBeGreaterThan(0);
  });
});

describe('check-fault-cases · a case that is not complete', () => {
  it('refuses a case whose causal chain was deleted, naming the layer and the reason', async () => {
    const dir = corpus({
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        delete truth.causalChain;
      },
    });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('process: groundTruth.causalChain is absent or empty');
  });

  it('refuses a case whose checkpoint names an entity the graph does not carry', async () => {
    const dir = corpus({
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
        checkpoints[0]!.entityRef = 'container:synthetic-storefront/gone';
      },
    });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('groundTruth.evidenceCheckpoints[cp-cpu-limit].entityRef -> container:synthetic-storefront/gone');
  });

  it('refuses a case whose step cites evidence it does not state', async () => {
    const dir = corpus({
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        const chain = truth.causalChain as Array<Record<string, unknown>>;
        chain[0]!.evidenceRefs = ['cp-nowhere'];
      },
    });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('step 1 -> cp-nowhere');
  });

  it('refuses a case whose root cause resolves nowhere', async () => {
    const dir = corpus({
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        truth.rootCauseEntityId = 'service:synthetic-storefront/never-existed';
      },
    });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('entity: \'service:synthetic-storefront/never-existed\' resolves to no entity in the graph');
  });
});

describe('check-fault-cases · the link back to the extraction key', () => {
  it('refuses a case annotated from a sample the key does not carry', async () => {
    // Otherwise the coverage figure is a number about a directory rather than about the key.
    const dir = corpus({ entry: { sampleId: 'no-such-sample' } });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("names sample 'no-such-sample', which the extraction key does not carry");
  });

  it('refuses a fault type that disagrees with the sample the case is annotated from', async () => {
    // Finding 255. The corpus is two documents -- an extraction key of thirty samples and a set of
    // four-layer annotations -- joined by one string, and nothing compared them: the key says what the
    // fault is and the annotation says what the case ran, and a disagreement between the two would
    // have left the benchmark scoring an answer the key does not ask for.
    const result = await run([
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

  it('refuses a category that disagrees with the sample', async () => {
    const result = await run([
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

  it('refuses a root cause component that disagrees with the sample', async () => {
    // The one that matters most: the component is the answer a solver has to name, so a case whose
    // truth is a different component from the key's is a case with two answers.
    const result = await run([
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

  it('accepts the corpus, where every case agrees with its sample', async () => {
    const result = await run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
  });

  it('refuses an entry that does not say where its annotation came from', async () => {
    const dir = corpus({ entry: { why: 'because' } });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('does not say in at least forty characters');
  });

  it('refuses two annotations of one case', async () => {
    const dir = corpus({});
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as Record<string, unknown>;
    const cases = index.cases as unknown[];
    index.cases = [...cases, cases[0]];
    writeFileSync(join(dir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('appears twice in the index');
  });

  it('refuses a case file the index does not name', async () => {
    // A file nobody indexed is a case that never runs, and the directory reading as one case
    // while holding two is the count defect this repository keeps fixing.
    const dir = corpus({ extraFiles: ['orphan.json'] });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('orphan.json is not named in index.json');
  });
});

describe('check-fault-cases · the floor moves up, and cannot be quietly lowered', () => {
  it('refuses a corpus below its own floor', async () => {
    const dir = corpus({ min: 2 });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('1 four-layer case(s), below the floor of 2');
    expect(result.out).toContain('lowering it is a decision, not a repair');
  });

  it('reads a missing floor as zero rather than refusing the corpus', async () => {
    // `min` is the one field that may be absent: a corpus with cases and no floor still has
    // cases, and inventing a floor would be the guard grading its own homework.
    const dir = corpus({});
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as Record<string, unknown>;
    delete index.min;
    writeFileSync(join(dir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
    const result = await run(['--cases', dir]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('floor 0');
  });
});

describe('check-fault-cases · inputs it will not guess at', () => {
  it('refuses a case that does not parse, with exit 1 and the schema message', async () => {
    const dir = corpus({
      mutate: (faultCase) => {
        (faultCase.fault as Record<string, unknown>).category = 'not-a-category';
      },
    });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(1);
    expect(result.out).toContain('does not parse');
  });

  it('refuses an index with the wrong schema', async () => {
    const dir = corpus({ index: { schema: 'something-else', cases: [] } });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(1);
    expect(result.out).toContain("has schema 'something-else'");
  });

  it('refuses an index with no cases array', async () => {
    const dir = corpus({ index: { schema: 'rca-bench-fault-cases/2' } });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(1);
    expect(result.out).toContain("has no 'cases' array");
  });

  it('refuses a missing index and a missing key by name', async () => {
    const empty = workspace();
    const missingIndex = await run(['--cases', empty]);
    expect(missingIndex.status).toBe(1);
    expect(missingIndex.out).toContain('could not read the case index');

    const dir = corpus({});
    const missingKey = await run(['--cases', dir, '--samples', join(empty, 'nope.json')]);
    expect(missingKey.status).toBe(1);
    expect(missingKey.out).toContain('could not read the extraction key');
  });

  it('refuses an unknown argument and explains itself on --help', async () => {
    const unknown = await run(['--nonsense']);
    expect(unknown.status).toBe(1);
    expect(unknown.out).toContain("unknown argument '--nonsense'");

    const help = await run(['--help']);
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

  it('refuses a quote the incident text does not contain, one word changed', async () => {
    // The defect this is for: an annotator paraphrases the source from memory and the case then
    // rests on a sentence nobody wrote. One word is enough to fail it.
    const edited = sources();
    edited[0]!.quote = 'the pod sat pinned at its 400m limit';
    const result = await run(['--cases', corpus({ entry: { sources: edited } })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('cites a entity quote the incident text does not contain');
    expect(result.out).toContain('the pod sat pinned at its 400m limit');
  });

  it('accepts a quote whose whitespace differs from the text, because words are the claim', async () => {
    // The comparison folds whitespace rather than bytes: a quote reflowed across two lines is the
    // same sentence, and failing it would train the annotator to copy line breaks.
    const edited = sources();
    edited[1]!.quote = 'Container CPU throttling   counters climbed the whole time';
    const result = await run(['--cases', corpus({ entry: { sources: edited } })]);
    expect(result.status, result.out).toBe(0);
  });

  it('refuses a corpus that quotes three layers and leaves one unsupported', async () => {
    const edited = sources().filter((source) => source.layer !== 'process');
    const result = await run(['--cases', corpus({ entry: { sources: edited } })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('quotes no sentence for: process');
  });

  it('refuses a quote too short to be a sentence about anything', async () => {
    const edited = sources();
    edited[0]!.quote = 'the pod';
    const result = await run(['--cases', corpus({ entry: { sources: edited } })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('quote shorter than 12 characters');
  });

  it('refuses a source whose layer is not one of the four', async () => {
    const edited = sources();
    edited[2]!.layer = 'timeline';
    const result = await run(['--cases', corpus({ entry: { sources: edited } })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("layer 'timeline', which is not one of entity / fault / process / evidence");
  });

  it('refuses a quote with no statement of what it supports', async () => {
    const edited = sources();
    edited[3]!.why = 'because';
    const result = await run(['--cases', corpus({ entry: { sources: edited } })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('quotes for evidence without saying what it supports');
  });

  it('refuses an entry that cites no sources at all', async () => {
    const result = await run(['--cases', corpus({ entry: { sources: [] } })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('cites no sources');
  });
});

describe('check-fault-cases · the case is also held to L2, not only to its four layers', () => {
  // Finding 233: `assessFourLayer` answers "are the layers filled", not "is this a case". The
  // corpus carried three cases whose timestamps were `...:00Z` -- canonical to a human and not to
  // `checkG1Structural`, which requires milliseconds. Nothing noticed, because the guard had never
  // asked G1 anything. These two tests are the ask.

  it('refuses a timestamp that is not canonical UTC ISO-8601', async () => {
    const dir = corpus({
      mutate: (faultCase) => {
        faultCase.injectTime = '2026-09-14T02:03:00Z';
      },
    });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('fails the L2 structural contract: injectTime must be canonical UTC ISO-8601');
    expect(result.out).toContain("got '2026-09-14T02:03:00Z'");
  });

  it('refuses an onset that falls outside its own declared window', async () => {
    // A four-layer complete case with `injectTime` after `window.end` passes every check in
    // `assessFourLayer` and is a case no evaluator can score.
    const dir = corpus({
      mutate: (faultCase) => {
        const window = faultCase.window as Record<string, unknown>;
        window.start = '2026-09-14T03:00:00.000Z';
        window.end = '2026-09-14T04:00:00.000Z';
      },
    });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('injectTime falls outside the declared window');
  });
});

describe('check-fault-cases · the units in a checkpoint have to exist', () => {
  // The second half of L2 that this guard did not ask for. Two of the three cases carried units a
  // person writes and the conversion table does not have: `m` for millicores, `messages` for a
  // lag, `x` for a multiple. Nothing downstream could ever convert them, and nothing noticed
  // until G2 was asked.
  it('refuses a checkpoint whose unit is not in the conversion table', async () => {
    const dir = corpus({
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
        checkpoints[0]!.unit = 'messages';
      },
    });
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("fails the L2 reference contract: checkpoint 'cp-cpu-limit' uses unknown unit 'messages'");
  });

  it('refuses a causal step that the topology does not connect', async () => {
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
    const result = await run(['--cases', dir]);
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

  it('accepts the shipped declaration and says how many cases carry telemetry', async () => {
    const dir = corpus({ signals: signals() });
    const result = await run(['--cases', dir]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain(
      '1 of 1 also carry telemetry whose origin is declared, which passes G3, and which both the peak-z and the median-shift baselines place in their top-K',
    );
  });

  it('refuses a series with no anomaly in it', async () => {
    // Both series flat: the case still has four layers, resolves, and quotes its text, and G3
    // says the telemetry carries no fault. This is the assertion that proves the gate is running
    // rather than skipping a case with no metrics.
    const edited = signals();
    for (const one of seriesOf(edited)) {
      one.post = one.baseline;
    }
    const result = await run(['--cases', corpus({ signals: edited, competitor: false })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('signals fail G3: no metric sustains |Z| >= 2 for 3 samples after injection');
  });

  it('refuses a derived value whose quote is not in the incident text', async () => {
    const edited = signals();
    seriesOf(edited)[0]!.quote = '180ms to 4.4s';
    const result = await run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('derives \'request_duration_p99_ms\' from a quote the incident text does not contain');
  });

  it('refuses a declaration that names another case', async () => {
    const edited = signals();
    edited.caseId = 'history-something-else';
    const result = await run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("names signals for 'history-something-else'");
  });

  it('refuses an empty series', async () => {
    const edited = signals();
    edited.series = [];
    const result = await run(['--cases', corpus({ signals: edited, competitor: false })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('declares an empty signal series');
  });
});

describe('check-fault-cases · G5 is asked of every case, because it needs no telemetry', () => {
  it('refuses a case that does not isolate its answer key', async () => {
    // `answerKeyIsolated` is a claim the case makes about itself, and until this round nothing
    // read it. A case whose answer key sits beside its query is a case whose oracle is the payload.
    const dir = corpus({
      mutate: (faultCase) => {
        faultCase.answerKeyIsolated = false;
      },
    });
    const result = await run(['--cases', dir]);
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

  it('refuses an origin that is neither derived nor captured', async () => {
    const edited = signals();
    edited.origin = 'measured';
    const result = await run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("declares origin 'measured', which is neither 'derived' nor 'captured'");
  });

  it('refuses the old field name instead of reading it as no origin at all', async () => {
    // A declaration that still says `provenance` would otherwise arrive with no `origin`, and the
    // guard would report a vocabulary error about an empty string -- a message pointing at the value
    // when the thing that has to move is the key.
    const edited = signals();
    edited.provenance = edited.origin;
    delete edited.origin;
    const result = await run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("declares 'provenance'; the signals field is 'origin'");
  });

  it('accepts captured, which nothing uses yet and the schema must still admit', async () => {
    // The value exists for the case that is eventually collected from a deployment. A vocabulary
    // with one member would make the word "derived" unfalsifiable.
    const edited = signals();
    edited.origin = 'captured';
    const result = await run(['--cases', corpus({ signals: edited })]);
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

  it('accepts a case whose own service carries the anomaly the baseliner finds', async () => {
    const result = await run(['--cases', corpus({ signals: signals() })]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('1 of 1 also carry telemetry');
    expect(result.out).toContain('both the peak-z and the median-shift baselines place in their top-K');
  });

  it('refuses a case whose anomaly belongs to a service the annotation does not name', async () => {
    // The signals stay anomalous, so G3 passes; the ranking is built from them, so the annotated
    // component is outranked by every metric that moved and G4 refuses. This is the shape of a case
    // that reads as valid and cannot be scored, which is exactly what the gate is for.
    //
    // The failure reads `absent` for both baselines, and after the corpus gained background telemetry
    // that is a stronger statement than it used to be: the annotated service is *in* the ranking, at
    // the flat request rate the background gives it, and it is absent from the answer because its
    // statistic is exactly zero. `locatedRank` is where that distinction lives -- a candidate that
    // showed nothing is not a candidate a method found.
    const edited = signals();
    for (const one of (edited.series as Array<Record<string, unknown>>)) {
      one.service = 'somebody-else';
    }
    const result = await run(['--cases', corpus({ signals: edited })]);
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

  it('refuses a case that only the spike-sensitive baseline can locate', async () => {
    // The negative control for `minSolvers: 2`. The spike is the root cause's only evidence: peak-z
    // sees it, the median of the window does not, so the robust ranking places `checkout-api` fourth
    // of four -- outside a top-K of three -- and the case is refused. Under one solver it would pass.
    //
    // `peak-z-by-service=1` rather than 2 is finding 288's doing. Finding 249 made the throttling
    // counter's pre-window flat at its baseline, which left its baseline with no spread at all; the
    // `1e-6` floor then turned its rise into an enormous z and the *pod* carrying it
    // (`checkout-api-0`, a different `service.name`) outranked the service -- a ranking decided by an
    // epsilon. The floor is the unit's resolution now, the pod's statistic is a real number, and the
    // service is first. The case is still refused for the reason the test is about: the robust
    // baseline's median cannot see a lone spike, so it places the answer fourth.
    // No competitor: this test is about the two solvers disagreeing, and a corpse-wide refusal for a
    // second reason would make its numbers unreadable.
    const result = await run(['--cases', corpus({ signals: spikeCase(), competitor: false })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('is not solvable by both baselines');
    expect(result.out).toContain('peak-z-by-service=1, median-shift-by-service=4');
  });

  it('refuses a noise value outside the vocabulary', async () => {
    // Finding 254. The field decides whether a reading is exact, so a typo must not be read as
    // `sampled`: `"none "` would otherwise produce a jittered series that reads as exact.
    const edited = spikeCase();
    (edited.series as Array<Record<string, unknown>>)[0]!.noise = 'samppling';
    const result = await run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares noise 'samppling' for 'request_duration_p99_ms', which is not one of sampled / none",
    );
  });

  it('refuses a noise claim on a counter, because a counter is already exact', async () => {
    // Two ways to say one thing is one too many: a counter's samples are its accumulation and carry no
    // noise either way, so the field beside it says nothing and would let a reader believe it did.
    const edited = spikeCase();
    (edited.series as Array<Record<string, unknown>>)[1]!.noise = 'none';
    const result = await run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares noise for 'container_cpu_throttled_seconds_total', which is a counter -- its samples are exact either way",
    );
  });

  it('refuses a count declared as a fraction of a thing', async () => {
    // The other side of the same grid. The rule above holds the *samples*; this holds the number the
    // author wrote, and it is not the same rule: a declaration of 12.5 things expands to samples the
    // grid can round, but a counter's last sample is required to be the declared post, and rounding
    // it would move the reading the file states. A file whose reading moved on the way to a solver is
    // the failure this whole guard exists to prevent.
    const declared = JSON.parse(
      readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
    ) as { series: Array<Record<string, unknown>> };
    declared.series.push({
      service: 'checkout-api',
      metric: 'throttled_periods',
      unit: 'count',
      baseline: 200,
      post: 201.5,
      noise: 'none',
      quote: 'the pod sat pinned at its 500m limit',
      why: 'a count declared as a fraction, which is the number the expansion would have to round',
    });
    const result = await run(['--cases', corpus({ signals: declared })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("declares post 201.5 for 'throttled_periods' in 'count'");
    expect(result.out).toContain('a count lands on whole things');
  });

  it('refuses a derivation outside the vocabulary instead of treating it as a step', async () => {
    // The first version of the expansion tested `derivation === 'counter'` and let everything else
    // mean `step`, so `"counters"` would have produced a step series silently -- a file that reads
    // as a counter and expands as a level.
    const edited = spikeCase();
    (edited.series as Array<Record<string, unknown>>)[1]!.derivation = 'counters';
    const result = await run(['--cases', corpus({ signals: edited })]);
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

  it('prints what the coverage report says about each suite the corpus could be exported to', async () => {
    const result = await run(['--cases', corpus({ signals: signals() })]);
    expect(result.status, result.out).toBe(0);
    // RE3's reason lost its `trace` half in the round that gave the latency cases their spans: the
    // checkout declaration is one of the three, so the fixture now supplies a span and the suite is
    // degraded for the modality it still has none of.
    expect(result.out).toContain(
      'coverage rcaeval-re1 ready · rcaeval-re2 degraded (no log) · rcaeval-re3 degraded (no log)',
    );
  });

  it('reads which of the written cases carry which modality, not how many files are empty', async () => {
    // The count this replaces was `1 file(s) with no rows (logs.csv in 1 case(s))` and it existed to
    // make the exporter's header-only tables visible. They are no longer written (finding 321), so a
    // count of them would be a constant zero -- and what a reader needs is the share: a case with no
    // log line is a case the log-based methods cannot be asked about.
    const result = await run(['--cases', corpus({ signals: signals() })]);
    // RE1 declares no modality, so it carries none: asking whether a metric-only suite's cases have
    // logs would report every RE1 export as deficient.
    expect(result.out).toContain(
      'export RE1 1 case(s) written · RE2 1 case(s) written, logs in 0 of 1, traces in 1 of 1',
    );
    expect(result.out).toContain('RE3 0 case(s) written, 1 skipped');
    expect(result.out).not.toContain('file(s) with no rows');
  });

  it('says nothing about coverage when no case carries telemetry, rather than reporting zeroes', async () => {
    // A corpus with no signals has no coverage to report, and printing `0%` for every modality would
    // be a measurement of nothing. The line is absent, which is the honest form of "not asked".
    const result = await run(['--cases', corpus({})]);
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

  it('accepts the shipped log line, because it quotes the broker and not the author', async () => {
    const result = await run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
    // One case of four now fills a `logs.csv`, which is why RE2 stops being degraded.
    expect(result.out).toContain('rcaeval-re2 ready');
    // Every case writes an RE2 case, so the count is the corpus size, and the modality shares stay
    // regexes rather than numbers: which cases carry a log line is a property of the corpus's shape
    // rather than of this assertion, and it moves every time a case is annotated.
    expect(result.out).toMatch(
      new RegExp(`RE2 ${String(CORPUS_SIZE)} case\\(s\\) written, logs in \\d+ of ${String(CORPUS_SIZE)}, traces in \\d+ of ${String(CORPUS_SIZE)}`),
    );
  });

  it('accepts a log line whose quote is in its own case text', async () => {
    const result = await run(['--cases', corpus({ signals: withLog(() => undefined) })]);
    expect(result.status, result.out).toBe(0);
  });

  it('refuses a log body whose quote is not in the incident text', async () => {
    const result = await run([
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

  it('refuses a log body too short to be a line', async () => {
    const result = await run([
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

  it('refuses a log line that does not say what it supports', async () => {
    const result = await run([
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

  /**
   * The checkout annotation with one log checkpoint, over the line `withLog` declares.
   *
   * A log checkpoint is the only kind whose assertion is about a *string*, and a string is the one
   * thing `compareExactly` cannot hold: the body is a reconstruction of a line the incident text
   * describes, so "this line says what the case needs it to say" is a claim about text the case
   * itself wrote. That is exactly the claim nothing read until this round.
   */
  function withLogCheckpoint(
    edit: (checkpoint: Record<string, unknown>) => void,
  ): (faultCase: Record<string, unknown>) => void {
    return (faultCase) => {
      const truth = faultCase.groundTruth as Record<string, unknown>;
      const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
      const checkpoint: Record<string, unknown> = {
        checkpointId: 'cp-throttling-line',
        entityRef: 'container:synthetic-storefront/checkout-api-app',
        signalKind: 'log',
        signalRef: 'throttling-line',
        comparator: 'contains',
        value: 'cpu throttling',
        description: "the pod's own words for the state, which no metric states in words",
      };
      edit(checkpoint);
      checkpoints.push(checkpoint);
    };
  }

  it('accepts a log checkpoint whose phrase is in the line it cites', async () => {
    const result = await run([
      '--cases',
      corpus({ mutate: withLogCheckpoint(() => undefined), signals: withLog(() => undefined) }),
    ]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('1 of 1 log assertion(s) hold against the body they cite');
  });

  it('refuses a log checkpoint whose phrase the line it cites does not contain', async () => {
    // The phrase is the whole assertion: a log line has no magnitude and no unit, so a checker that
    // stopped at "the id resolves" would accept every claim anyone wrote beside it.
    const result = await run([
      '--cases',
      corpus({
        mutate: withLogCheckpoint((checkpoint) => {
          checkpoint.value = 'memory pressure';
        }),
        signals: withLog(() => undefined),
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "checkpoint 'cp-throttling-line' asserts log 'throttling-line' contains 'memory pressure', and the line it cites does not",
    );
  });

  it('refuses a log checkpoint that orders two numbers, because a log has one relation', async () => {
    const result = await run([
      '--cases',
      corpus({
        mutate: withLogCheckpoint((checkpoint) => {
          checkpoint.comparator = '>=';
        }),
        signals: withLog(() => undefined),
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "checkpoint 'cp-throttling-line' compares a log line with '>=', and a log has one relation: whether it contains the phrase the checkpoint cites",
    );
  });

  it('says how many log assertions hold, over the corpus it was given', async () => {
    // Printed on every run because the line above it counts *comparable* assertions, and a log
    // assertion is not one of them: it is compared with text rather than ordered. Before this
    // line, four checkpoints of the shipped corpus stated a containment and the report counted
    // none of them -- one of the four was false, and the run was green.
    const result = await run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toMatch(/(\d+) of \1 log assertion\(s\) hold against the body they cite/);
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

  it('makes the coverage report call every suite ready, which it never could before', async () => {
    const result = await run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('rcaeval-re3 ready');
  });

  it('accepts a parent that names a span in the same file, and fills traces.csv', async () => {
    const result = await run(['--cases', corpus({ signals: withTraces(() => undefined) })]);
    expect(result.status, result.out).toBe(0);
    // The span table is written and the log table is not: this case declares two spans and no log
    // line, and the exporter stopped manufacturing an empty `logs.csv` for the one it has nothing
    // to put in (finding 321). The reading says which, per case, which the old file count could not.
    expect(result.out).toContain('RE2 1 case(s) written, logs in 0 of 1, traces in 1 of 1');
  });

  it('refuses a span whose quote is not in the incident text', async () => {
    const result = await run([
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

  it('refuses a duration of zero, which is a span that did not happen', async () => {
    const result = await run([
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

  it('refuses a parent that names no span in the file', async () => {
    // A row whose parent id belongs to nothing is a span an exporter writes and no reader can
    // assemble, which is worse than a missing row because it looks complete.
    const result = await run([
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

  it('refuses a span that does not say what it supports', async () => {
    const result = await run([
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
  it('writes an RE3 case, which no annotation could do before', async () => {
    // RE3 selects on `category === 'code'`, and the corpus had none: four cases of resource,
    // network and middleware. The fifth is an uncaught exception in a CSV writer, so the suite that
    // had always reported `0 case(s) written, 4 skipped` now writes one -- and the reason its
    // `traces.csv` is empty is that the text states no duration, which is printed rather than
    // hidden.
    const result = await run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
    // The count, not the history. RE3 selects on `category === 'code'`, so the number it writes is
    // the number of code-level cases in the corpus -- derived here from the case files rather than
    // written down, because the literal `2` was a milestone that turned into a tripwire the first
    // time the corpus grew.
    expect(CODE_LEVEL_CASES, 'the corpus carries no code-level case; RE3 would write nothing').toBeGreaterThan(0);
    expect(result.out).toContain(`RE3 ${String(CODE_LEVEL_CASES)} case(s) written`);
  });
});

describe('check-fault-cases · a checkpoint says what its reference is a reference to', () => {
  // One optional string used to carry four different things and nothing resolved it: eight of eleven
  // checkpoints named a series that did not exist (finding 243). `signalKind` separates them, and
  // each kind has the rule that can be applied to it.
  const CHECKOUT = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  /**
   * The checkout declaration plus a second series carrying one metric on another entity.
   *
   * The copy inherits the quote and the reason of the series it is copied from and moves one second
   * past it, so the two are different readings of one quantity rather than two names for one number.
   */
  function withSecondCarrier(metric: string, service: string): Record<string, unknown> {
    const edited = JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown> & {
      series: Array<Record<string, unknown>>;
    };
    const first = edited.series.find((one) => one.metric === metric)!;
    edited.series.push({ ...first, service, post: Number(first.post) + 1 });
    return edited;
  }

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

  it('resolves every reference in the corpus by its own kind', async () => {
    const result = await run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
    // Twelve of twelve: eight name a series, two are derived and read four readings between them
    // (one of the two reads two points of one series), one names a log line by id, and one is a
    // configuration fact that names no series at all. Ten are comparable, and all ten hold.
    // The claim is that *every* reference resolves and *no* comparable assertion fails, so the
    // assertion is an equality between the two counts in each pair rather than a literal total.
    // The literal form (`41 of 41 ... 0 of 37`) restated the corpus and went red on the round that
    // annotated one more case, which is the shape a guard must not have: it reports a change in
    // the data as a defect in the guard.
    const summary =
      /checkpoints (\d+) of (\d+) reference\(s\) resolve by kind \((\d+) over a series -- (\d+) on the entity the checkpoint names and (\d+) on one that contains it -- (\d+) computed from (\d+) reading\(s\), (\d+) citing a declared configuration fact, (\d+) over a log line\); (\d+) of (\d+) comparable assertion\(s\) fail/.exec(
        result.out,
      );
    expect(summary, result.out).not.toBeNull();
    const [, resolved, total, overSeries, byEntity, byComponent, derived, , configuration, logLines, failed, comparable] =
      summary as unknown as string[];
    expect(resolved, 'every reference must resolve').toBe(total);
    expect(Number(total), 'the corpus must carry references for this to be a measurement').toBeGreaterThan(0);
    expect(Number(comparable), 'the guard must compare something').toBeGreaterThan(0);
    expect(failed, 'no comparable checkpoint may disagree with the data it names').toBe('0');
    // The two halves of the series count are a partition of everything that is not derived, and the
    // component half is not zero: an equality rule would have refused twelve annotations, so a guard
    // that reported `0` here would mean the containment arm had become dead code.
    expect(Number(byEntity) + Number(byComponent), 'each series resolves one way or the other').toBe(
      Number(overSeries) - Number(derived),
    );
    expect(Number(byComponent), 'the corpus relies on containment, and the count says how much').toBeGreaterThan(0);
    // The kinds are a partition, and this assertion is the one an earlier draft had to withdraw:
    // it summed `over a series` and `computing from a reading` and got a larger number than the
    // total, because the log kind was counted and not printed. With the fourth kind printed the
    // arithmetic closes, so a fifth kind added without a counter fails here rather than quietly
    // making the report a list that no longer adds up.
    expect(
      Number(overSeries) + Number(configuration) + Number(logLines),
      'the printed kinds must account for every reference',
    ).toBe(Number(total));
  });

  it('refuses a series reference the signals file does not declare', async () => {
    const result = await run(['--cases', withCheckpoint((cp) => { cp.signalRef = 'request_duration_p99'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("checkpoint 'cp-p99' names 'request_duration_p99', which the signals file does not declare");
    expect(result.out).toContain('it declares: request_duration_p99_ms, container_cpu_throttled_seconds_total');
  });

  it('refuses a checkpoint whose unit disagrees with its series', async () => {
    const result = await run(['--cases', withCheckpoint((cp) => { cp.unit = 's'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("is in 's' but the series 'request_duration_p99_ms' is in 'ms'");
  });

  it('refuses a checkpoint its own series fails', async () => {
    // The defect that only a resolved reference can reveal: `>` against a value equal to the post.
    const result = await run(['--cases', withCheckpoint((cp) => { cp.comparator = '>'; cp.value = 4300; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("asserts request_duration_p99_ms > 4300, and the series' post value is 4300");
  });

  it('refuses a configuration fact that names a series', async () => {
    // Two statements of one value, one of which the guard would start comparing with telemetry.
    const result = await run(['--cases', withCheckpoint((cp) => { cp.signalKind = 'configuration'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("checkpoint 'cp-p99' calls 'request_duration_p99_ms' a configuration fact");
  });

  it('refuses a log reference that matches no declared line', async () => {
    const result = await run(['--cases', withCheckpoint((cp) => { cp.signalKind = 'log'; cp.signalRef = 'nothing'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("checkpoint 'cp-p99' names log 'nothing', which the signals file does not declare");
  });

  it('refuses a checkpoint with no reference at all', async () => {
    const result = await run(['--cases', withCheckpoint((cp) => { delete cp.signalRef; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("checkpoint 'cp-p99' names no signal, so nothing carries it");
  });

  it('refuses a signal kind outside the vocabulary, and the schema does it', async () => {
    // `signalKind` is a published vocabulary in `ir/types.ts`, so a bad member fails the parse --
    // exit 1, "could not be read as a FaultCase" -- rather than the guard's own check. The guard had
    // a membership test for one round after the schema gained the enum, and it was unreachable: an
    // unrecognised kind never reached it. Deleted rather than kept as a second opinion.
    const result = await run(['--cases', withCheckpoint((cp) => { cp.signalKind = 'telemetry'; })]);
    expect(result.status).toBe(1);
    expect(result.out).toContain('could not be read as a FaultCase');
    // The message carries the field and the reason -- `describeSchemaFailure` composes it, because
    // the first line of a zod issue list is `[` and that was the whole diagnosis for every refusal.
    expect(result.out).toContain('signalKind: Invalid enum value.');
  });

  it('refuses a log line with no id, because nothing can reference it', async () => {
    const edited = JSON.parse(readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8')) as Record<string, unknown>;
    edited.logs = [{ service: 'checkout-api-0', body: 'throttled for eleven minutes', quote: 'Container CPU throttling counters climbed the whole time', why: 'a line with no id is a line no checkpoint can name' }];
    const result = await run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('declares a log line with no id, which nothing can reference');
  });
});

describe('check-fault-cases · a series reference names an entity and a metric', () => {
  // Finding 323, and the half of finding 299's repair that makes it a rule rather than a wish.
  //
  // A series is a reading taken *on* something, so `(entity, metric)` is its identity -- the pair
  // `fault/background.ts` uses, and the pair both localisers key their statistics on. The guard built
  // a map keyed on the metric name and read out of it, so the entity in a checkpoint was decoration:
  // measured over the shipped corpus, 12 of 73 series checkpoints name an entity that does not carry
  // the reading, and the same code would have accepted a checkpoint pointed at anything in the graph.
  //
  // The rule cannot be equality. All 12 are legitimate -- a container's memory figure filed under the
  // service, because the ranking a solver reads is per service -- so what is required is that the
  // reading is on the entity or on a component of it, which is the judgement `checkLogAttribution`
  // has made about log lines since finding 286. Run over the corpus, the rule found one annotation
  // that was wrong: `cp-lag` asserted the consumer group's lag on the *queue*, the wrong end of a
  // producer/consumer pair, in a case whose own root-cause reason says the lag was consumer-side.
  const CHECKOUT = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  /**
   * The checkout declaration plus a second series carrying one metric on another entity.
   *
   * The copy inherits the quote and the reason of the series it is copied from and lands one second
   * past it, so the two are two readings of one quantity rather than two names for one number --
   * which is what makes the resolution observable: a checkpoint made true by one carrier and false by
   * the other reports which one was read.
   */
  function withSecondCarrier(metric: string, service: string): Record<string, unknown> {
    const edited = JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown> & {
      series: Array<Record<string, unknown>>;
    };
    const first = edited.series.find((one) => one.metric === metric)!;
    edited.series.push({ ...first, service, post: Number(first.post) + 1 });
    return edited;
  }

  /** The checkout declaration with one checkpoint edited, which is the case the scratch corpus writes. */
  function withCheckpoint(
    id: string,
    edit: (checkpoint: Record<string, unknown>) => void,
    signals: Record<string, unknown> = CHECKOUT,
  ): string {
    return corpus({
      signals: JSON.parse(JSON.stringify(signals)) as Record<string, unknown>,
      mutate: (faultCase) => {
        const truth = faultCase.groundTruth as Record<string, unknown>;
        const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
        edit(checkpoints.find((one) => one.checkpointId === id)!);
      },
    });
  }

  it('refuses two series with one pair, because a reference to either names neither', async () => {
    // The rule used to read the *metric*, which is not the identity of a series: a reading is a
    // quantity on something, so `(entity, metric)` is what a reference has to name (finding 323).
    // The refusal now says both halves, because "two series named X" was true of a case that
    // declared one metric on two entities -- which is legal, and is how a partition is written.
    const edited = JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown> & { series: Array<Record<string, unknown>> };
    edited.series.push({ ...edited.series[0]!, post: 1 });
    const result = await run(['--cases', corpus({ signals: edited })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares two series for 'request_duration_p99_ms' on 'checkout-api', so a reference to either names neither",
    );
  });

  it('refuses a series the entity the checkpoint names does not carry', async () => {
    // The defect the rule was written for. Before it, `signalRef` was resolved against a map keyed
    // on the metric name, so this checkpoint -- which asserts a latency the payment service has
    // nothing to do with -- resolved and compared and passed. Measured over the corpus: 12 of 73
    // series checkpoints are carried a component away and all 12 are legitimate, so the rule cannot
    // be equality; one of them pointed at the wrong end of a producer/consumer pair, which is the
    // one that was wrong and this is why the rule is containment rather than either extreme.
    const result = await run([
      '--cases',
      withCheckpoint('cp-p99', (cp) => {
        cp.entityRef = 'service:synthetic-storefront/payment-service';
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "checkpoint 'cp-p99' names 'request_duration_p99_ms' on 'service:synthetic-storefront/payment-service', " +
        'and the series carrying it are filed under checkout-api: a different component',
    );
  });

  it('refuses a metric two components carry inside the entity the checkpoint names', async () => {
    // The other half of finding 299's repair. One metric on two entities is now a legal declaration
    // -- and the checkpoint that names the container of both has said something the data cannot
    // answer, which is a refusal rather than a tie broken in whichever order the file was written.
    const result = await run([
      '--cases',
      withCheckpoint(
        'cp-throttled-counters',
        (cp) => {
          // The service contains both carriers and is neither of them, so the pair the checkpoint
          // states is two series wide and the entity cannot choose between them.
          cp.entityRef = 'service:synthetic-storefront/checkout-api';
        },
        withSecondCarrier('container_cpu_throttled_seconds_total', 'checkout-api-app'),
      ),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "checkpoint 'cp-throttled-counters' names 'container_cpu_throttled_seconds_total' on " +
        "'service:synthetic-storefront/checkout-api', and 2 series carry it where that entity cannot " +
        'tell them apart (checkout-api-0, checkout-api-app)',
    );
  });

  it('resolves the reading a checkpoint names when two components carry one metric', async () => {
    // The capability, not only the refusal: the same two series, and a checkpoint that says which
    // one it means. This is the shape a partition needs and the corpus could not write at all
    // before the pair (`the members each side sees` was one series and one prose sentence).
    const result = await run([
      '--cases',
      corpus({
        signals: withSecondCarrier('container_cpu_throttled_seconds_total', 'checkout-api-app'),
        mutate: (faultCase) => {
          const truth = faultCase.groundTruth as Record<string, unknown>;
          const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
          const checkpoint = checkpoints.find((one) => one.checkpointId === 'cp-throttled-counters')!;
          checkpoint.entityRef = 'container:synthetic-storefront/checkout-api-app';
          // The copy on the container climbs by one second, so the assertion has to be about the
          // container's reading rather than the pod's: a test that passed on either would not say
          // which series the pair resolution picked.
          checkpoint.value = 95;
        },
      }),
    ]);
    expect(result.out).not.toContain('cannot tell them apart');
    expect(result.status, result.out).toBe(0);
  });

  it('reads the series the pair names, which is a different number from its twin', async () => {
    // The assertion above says the corpus is accepted; this one says *which* series was read. The
    // two carriers differ by one second, so a checkpoint made true by one of them and false by the
    // other turns the resolution into a visible decision: `> 96` against the pod's 96 fails, and the
    // same case naming the container holds. A guard that resolved by rewriting the pair into a name
    // would answer one of these two runs wrongly and both would look plausible.
    const withPost = (entityRef: string, value: number): string =>
      corpus({
        signals: withSecondCarrier('container_cpu_throttled_seconds_total', 'checkout-api-app'),
        mutate: (faultCase) => {
          const truth = faultCase.groundTruth as Record<string, unknown>;
          const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
          const checkpoint = checkpoints.find((one) => one.checkpointId === 'cp-throttled-counters')!;
          checkpoint.entityRef = entityRef;
          checkpoint.value = value;
        },
      });
    const onPod = await run([
      '--cases',
      withPost('pod:synthetic-storefront/checkout-api-0', 96),
    ]);
    expect(onPod.status).toBe(2);
    expect(onPod.out).toContain(
      "asserts container_cpu_throttled_seconds_total > 96, and the series' post value is 96",
    );
    const onContainer = await run([
      '--cases',
      withPost('container:synthetic-storefront/checkout-api-app', 96),
    ]);
    expect(onContainer.status, onContainer.out).toBe(0);
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

  it('accepts a derived checkpoint that computes what the data says', async () => {
    // 4300ms at the post onset, 180ms at the baseline, both declared beside the sentence that states
    // them: the difference is 4120ms and the annotation now has to say so in arithmetic.
    const result = await run(['--cases', derived('request_duration_p99_ms.post - request_duration_p99_ms.baseline')]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('1 computed from 2 reading(s)');
  });

  it('refuses a stated value the expression does not produce', async () => {
    const result = await run([
      '--cases',
      derived('request_duration_p99_ms.post - request_duration_p99_ms.baseline', { value: 4100 }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "checkpoint 'cp-p99' asserts 'request_duration_p99_ms.post - request_duration_p99_ms.baseline' == 4100, " +
        'and it computes to 4120',
    );
  });

  it('reports a computed value at twelve significant digits, not seventeen', async () => {
    // `4300 / 180` is 23.88888888888889. Printing all of it makes an author hunt for a difference
    // that is not the one the message is about.
    const result = await run([
      '--cases',
      derived('request_duration_p99_ms.post / request_duration_p99_ms.baseline', { value: 24, unit: '1' }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain('and it computes to 23.8888888889');
  });

  it('refuses a computed value stated in the wrong unit', async () => {
    const result = await run([
      '--cases',
      derived('request_duration_p99_ms.post / request_duration_p99_ms.baseline', { value: 23.8888888889, unit: 'ms' }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("computes 'request_duration_p99_ms.post / request_duration_p99_ms.baseline' to a value in '1', but states 'ms'");
  });

  it('refuses arithmetic over a metric the signals file does not declare', async () => {
    const result = await run(['--cases', derived('request_duration_p99_ms.post - request_duration_p99_ms.median')]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("reads the point 'median' at character 55, which is not one of baseline, post");
  });

  it('adds two units the table can convert, and reports the sum in the left one', async () => {
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
    const result = await run([
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

  it('refuses a derived checkpoint with no expression, and says which field is missing', async () => {
    const dir = derived('request_duration_p99_ms.post');
    const text = readFileSync(join(dir, 'case.json'), 'utf8');
    const edited = JSON.parse(text) as Record<string, unknown>;
    const truth = edited.groundTruth as Record<string, unknown>;
    const checkpoints = truth.evidenceCheckpoints as Array<Record<string, unknown>>;
    delete checkpoints.find((one) => one.checkpointId === 'cp-p99')!.expression;
    writeFileSync(join(dir, 'case.json'), `${JSON.stringify(edited, null, 2)}\n`);
    const result = await run(['--cases', dir]);
    expect(result.status).toBe(1);
    expect(result.out).toContain('expression: a derived checkpoint states the arithmetic that produces its value');
  });

  it('refuses a derived checkpoint that also names one series', async () => {
    const result = await run([
      '--cases',
      derived('request_duration_p99_ms.post - request_duration_p99_ms.baseline', {
        extra: { signalRef: 'request_duration_p99_ms' },
      }),
    ]);
    expect(result.status).toBe(1);
    expect(result.out).toContain('signalRef: a derived checkpoint is referenced by its expression');
  });

  it('refuses an expression on a checkpoint that is not derived', async () => {
    // One field with one meaning: a series checkpoint carrying arithmetic would be a second statement
    // of how its number was obtained, which nothing would compare.
    const result = await run([
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

  it('counts a derived assertion among the comparable ones, and only one that resolves', async () => {
    // The count is what makes the corpus's own line meaningful: a checkpoint that could not be
    // evaluated must not appear in the denominator as though it had been checked.
    const result = await run(['--cases', derived('request_duration_p99_ms.post - request_duration_p99_ms.baseline', { value: 4100 })]);
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

  it('accepts the corpus checkpoint, which cites the injection\'s own parameter', async () => {
    const result = await run(['--cases', CASES]);
    expect(result.status, result.out).toBe(0);
    // What has to hold is that a configuration checkpoint is admitted at all -- the rule exists
    // because `container_spec_cpu_quota` was a plausible metric name that nothing declared -- and
    // that admitting it made it comparable rather than excusing it. The count itself is the
    // corpus's business, and pinning it here made every new case a test edit.
    const admitted =
      /(\d+) citing a declared configuration fact, \d+ over a log line\); (\d+) of (\d+) comparable assertion\(s\) fail/.exec(
        result.out,
      );
    expect(admitted, result.out).not.toBeNull();
    const [, configuration, failed, comparable] = admitted as unknown as string[];
    expect(Number(configuration), 'no configuration checkpoint is admitted; the rule would be untested').toBeGreaterThan(0);
    expect(Number(comparable), 'admitting a configuration fact must add it to the comparable set').toBeGreaterThan(
      Number(configuration),
    );
    expect(failed, 'a configuration checkpoint must be comparable, and must hold').toBe('0');
  });

  it('refuses a configuration fact the case does not declare, and names what it does', async () => {
    // This is the defect itself: `container_spec_cpu_quota` is a plausible metric name that nothing
    // in the case declares, so the checkpoint was citing prose.
    const result = await run(['--cases', withConfiguration((cp) => { cp.signalRef = 'container_spec_cpu_quota'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "calls 'container_spec_cpu_quota' a configuration fact, but fault.parameters declares no such key " +
        '(it declares: container, cpuLimit)',
    );
  });

  it('refuses a stated value the case does not declare', async () => {
    const result = await run(['--cases', withConfiguration((cp) => { cp.value = 600; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("asserts 'cpuLimit' == 600, and fault.parameters declares 500 mcore");
  });

  it('converts a checkpoint stated in another unit of the same dimension', async () => {
    // 500 mcore is 0.5 cores, and the table says so: the checkpoint may state the quota in either
    // unit and the comparison is against the converted value.
    const result = await run(['--cases', withConfiguration((cp) => { cp.unit = 'core'; cp.value = 0.5; })]);
    expect(result.status, result.out).toBe(0);
    // One case: three checkpoints, all comparable, none failing. The conversion is visible in the
    // fact that the assertion is counted at all -- `0.5 core` is compared with `500 mcore`.
    expect(result.out).toContain(
      '1 citing a declared configuration fact, 0 over a log line); 0 of 3 comparable assertion(s) fail',
    );
  });

  it('refuses a unit the table cannot convert into the declared one', async () => {
    const result = await run(['--cases', withConfiguration((cp) => { cp.unit = 's'; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "is in 's' and 'cpuLimit' is declared in 'mcore', which are not the same unit and not convertible",
    );
  });

  it('refuses a unit beside a parameter that declares none', async () => {
    // A unit nothing can check is a claim, not a fact: the parameter holds a bare number.
    const result = await run([
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

  it('refuses a parameter cited without the unit it is declared in', async () => {
    const result = await run(['--cases', withConfiguration((cp) => { delete cp.unit; })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("cites 'cpuLimit' without a unit, and fault.parameters declares it in 'mcore'");
  });

  it('refuses a string parameter, which is an identifier rather than a fact', async () => {
    // `container == 'checkout-api-app'` restates the parameter in a second place, and the parameter is
    // already in the file.
    const result = await run(['--cases', withConfiguration((cp) => { cp.signalRef = 'container'; cp.unit = '1'; })]);
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

  it('refuses a share above 100 per cent, and says what the unit admits', async () => {
    const result = await run(['--cases', withSeries({ unit: '1', baseline: 0, post: 1.2 })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares post 1.2 for 'scratch_reading' in '1', and a reading in '1' lies in [0, 1]",
    );
    expect(result.out).toContain('FAILED — 1 problem(s)');
  });

  it('accepts a share of exactly 1, which is the sentence "every request failed"', async () => {
    const result = await run(['--cases', withSeries({ unit: '1', baseline: 0, post: 1 })]);
    expect(result.status, result.out).toBe(0);
  });

  it('refuses a negative duration, because a duration is not signed', async () => {
    // The lower bound is a statement rather than a default: nothing in this table is a signed
    // quantity, so -1 ms is not a small duration, it is the wrong shape.
    const result = await run(['--cases', withSeries({ unit: 'ms', baseline: -1, post: 4300 })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares baseline -1 for 'scratch_reading' in 'ms', and a reading in 'ms' lies in [0, ∞)",
    );
  });

  it('says nothing about a unit the table does not know, because it has no range to state', async () => {
    // `MiB/s` is a compound the conversion table has no entry for. Refusing a reading in it would be
    // this rule inventing a bound, which is the failure mode it exists to prevent at the other end.
    const result = await run(['--cases', withSeries({ unit: 'MiB/s', baseline: -5, post: 4 })]);
    // G2 refuses the unit itself, which is a different rule and the one that should speak here.
    expect(result.out).not.toContain('lies in');
  });
});

describe('check-fault-cases · a reading can cite a parameter instead of copying it', () => {
  // Finding 258. The pool's ceiling was a reading (`connections in use == 20`) and a parameter
  // (`poolSize: 20`), kept in step by being edited together. `post` may now be `{ parameter: 'x' }`,
  // resolved against the case's own parameters, and the four refusals below are the ways that can go
  // wrong: a name that is not there, a value that is not a quantity, a unit that does not convert, and
  // a reading that is neither a number nor a reference.
  const CHECKOUT = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  /**
   * The checkout signals plus a scratch series whose `post` the caller chooses.
   *
   * The scratch series is attributed to `cart-service`, not to the case's own answer. It starts at
   * zero and jumps to whatever the caller passes, so on the answer's service it would be the largest
   * excursion in the window -- and a corpus whose answer is the largest excursion is refused by
   * `checkDiscrimination`, correctly and for a reason none of these tests is about. Moving it to a
   * service the case does not answer with keeps the fixture a corpus while leaving the question
   * (does a reading and a declared parameter resolve to one number) untouched.
   */
  function withPost(post: unknown, unit: unknown = 'count'): string {
    const signals = JSON.parse(JSON.stringify(CHECKOUT)) as Record<string, unknown> & {
      series: Array<Record<string, unknown>>;
    };
    signals.series.push({
      service: 'cart-service',
      metric: 'scratch_reading',
      unit,
      baseline: 0,
      post,
      quote: 'No error rate change in the downstream payment service',
      why: 'a scratch series the parameter-reference rule is asked about',
    });
    return corpus({ signals });
  }

  it('accepts a reference to a quantity the case declares, and expands the resolved number', async () => {
    // `cpuLimit` is `{ value: 500, unit: 'mcore' }`, so a series in `mcore` can cite it. The case is
    // accepted, which is the whole point: the reading and the parameter are one number.
    const result = await run(['--cases', withPost({ parameter: 'cpuLimit' }, 'mcore')]);
    expect(result.status, result.out).toBe(0);
  });

  it('refuses a reference to a parameter the case does not declare, and lists the ones it does', async () => {
    const result = await run(['--cases', withPost({ parameter: 'poolSize' })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares post as parameter 'poolSize' for 'scratch_reading', and fault.parameters declares no " +
        'such key (it declares: container, cpuLimit)',
    );
  });

  it('refuses a parameter whose value is not a quantity', async () => {
    // `container` is a name, not a number: a reading that cites it has no value to be.
    const result = await run(['--cases', withPost({ parameter: 'container' })]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares post as parameter 'container' for 'scratch_reading', whose value \"checkout-api-app\" " +
        'is not a number or a { value, unit } quantity',
    );
  });

  it('refuses a parameter whose unit cannot convert into the series unit', async () => {
    const result = await run(['--cases', withPost({ parameter: 'cpuLimit' }, 'count')]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares post for 'scratch_reading' in 'count', and parameter 'cpuLimit' is declared in " +
        "'mcore', which is not convertible",
    );
  });

  it('refuses a reading that is neither a number nor a reference', async () => {
    const result = await run(['--cases', withPost('five')]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "declares post '\"five\"' for 'scratch_reading', which is neither a number nor a { parameter } " +
        'reference',
    );
  });
});

describe('check-fault-cases · the corpus has to be able to be wrong', () => {
  /**
   * The shipped corpus, in a scratch directory, cut down to one case.
   *
   * Built by copying rather than by writing: the question is about the corpus's own files, and a
   * hand-written fixture would answer it for a corpus nobody ships.
   */
  function oneCaseCorpus(caseId: string): string {
    const dir = workspace();
    cpSync(CASES, dir, { recursive: true });
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as {
      min: number;
      cases: Array<{ caseId: string; case: string; signals?: string; graph?: string }>;
    };
    const keep = index.cases.filter((entry) => entry.caseId === caseId);
    expect(keep, `${caseId} must be in the corpus for this test to measure it`).toHaveLength(1);
    for (const entry of index.cases) {
      if (entry.caseId === caseId) continue;
      rmSync(join(dir, entry.case), { force: true });
      if (entry.signals !== undefined) rmSync(join(dir, entry.signals), { force: true });
    }
    writeFileSync(
      join(dir, 'index.json'),
      `${JSON.stringify({ ...index, min: 1, cases: keep }, null, 2)}\n`,
    );
    return dir;
  }

  it('refuses a corpus whose every answer is the loudest component', async () => {
    // `history-cart-network-delay` is solved at rank 1 by both baselines: its answer is the only
    // thing that moved. A corpus of those reports a 100% score for a method that returns the
    // largest excursion, and the report calls it localisation.
    const result = await run(['--cases', oneCaseCorpus('history-cart-network-delay')]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      'the corpus fails G4: no case places a strictly louder, separate component above its answer (none 2), ' +
        'so returning the largest excursion is never wrong',
    );
  });

  // Each case that carries the corpus's discrimination property is pinned by name. The corpus-level
  // rule needs only one, so removing the loud competitor from *either* would leave the corpus green
  // and only a case-specific test red -- which is what the mutation battery found the round the
  // second one landed.
  for (const caseId of [
    'history-middleware-replica-lag-analytics',
    'history-resource-memory-request-ingest-writer',
  ]) {
    it(`accepts a corpus whose only case is '${caseId}', because its answer is displaced`, async () => {
      const result = await run(['--cases', oneCaseCorpus(caseId)]);
      expect(result.status, result.out).toBe(0);
      expect(result.out).toContain(`strictly displaced in 1 case(s) (${caseId})`);
    });
  }
});

describe('check-fault-cases · the difficulty distribution is a property of the corpus', () => {
  // The rule lived inside a gate this script asked of a one-case bundle, so `graded.length` was 0
  // or 1 against a minimum of ten and the branches could not be taken. A rule no caller can reach
  // is not a gate, and the only way to know it is reachable is to make the corpus reach it.

  it('reports a set that is entirely the easiest level, and fails it for the labels', async () => {
    // Two verdicts, and they are different. Every case here is labelled L1 while its chain supports
    // L3, so the run fails on the shortfalls -- an annotation contradicting its own case is a
    // one-line repair. The distribution is printed and also misses its target, but that is a
    // statement about the set: no correction to a label in it could produce an L4 case.
    const result = await run(['--cases', corpusOf(10, 'L1')]);
    expect(result.status, result.out).toBe(2);
    expect(result.out).toContain('a level may not claim less structure than the case carries');
    expect(result.out).toContain('L1 share 1.000 exceeds the 0.2 ceiling');
  });

  it('reports a set with no hardest case without failing the run', async () => {
    // `L3` is exactly the floor of this two-step, three-kind annotation, so there is no shortfall.
    // What is missing is an L4 case, and no label can invent one: the chain is two steps deep.
    // Printing it and passing is the deliberate choice -- a rule that fails every run on a property
    // only a new case can change is a rule everyone learns to skip.
    const result = await run(['--cases', corpusOf(10, 'L3')]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('L4 share 0.000 is below the 0.1 floor');
    expect(result.out, 'the spread is named, not just the violation').toContain('difficulty spread L1 0 / L2 0 / L3 10');
  });

  it('accepts a spread set, so the rule can pass as well as fail', async () => {
    // Nine at the floor and one above it: no L1, a tenth at L4, and nothing claiming less structure
    // than it carries. Asserted on the verdict rather than on the absence of a phrase, which is what
    // the earlier version did -- and that version passed while the run was red, because the message
    // it looked for had been reworded.
    const dir = corpusOf(10, 'L3');
    const hardest = JSON.parse(readFileSync(join(dir, 'case-9.json'), 'utf8')) as Record<string, unknown>;
    hardest.difficulty = 'L4';
    writeFileSync(join(dir, 'case-9.json'), `${JSON.stringify(hardest, null, 2)}\n`);
    const result = await run(['--cases', dir]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('within the target');
    expect(result.out).toContain('difficulty spread L1 0 / L2 0 / L3 9 / L4 1');
  });

  it('says how many cases state a level, because an unset level exports as medium', async () => {
    const ungraded = await run(['--cases', corpusOf(10)]);
    expect(ungraded.out).toContain('difficulty 0 of 10 case(s) state a level');

    const graded = await run(['--cases', corpusOf(10, 'L2')]);
    expect(graded.out).toContain('difficulty 10 of 10 case(s) state a level');
  });

  it('does not apply the distribution rule below its own sample size', async () => {
    // Nine is the largest set that cannot answer the question, and it must not answer it anyway:
    // a share computed from nine cases is a share of nine cases.
    const result = await run(['--cases', corpusOf(9, 'L1')]);
    expect(result.out).not.toContain('the corpus fails G4');
    expect(result.out).toContain('difficulty 9 of 9 case(s) state a level');
  });
});

describe('check-fault-cases · a key nothing cites has to say why it is there', () => {
  // The rule's own module is `fault/parameter-notes.ts`, and `parameter-notes.test.ts` holds its six
  // refusals apart from any corpus. What these cases check is the wiring: that the guard asks the
  // question of every annotated case, that its answer reaches the reader as a problem, and that the
  // line it prints is a partition of the keys rather than a share of them.
  //
  // Every fixture here declares telemetry, because that is where a citation comes from -- the note is
  // only meaningful next to the citations that excuse the other keys, and a case with no signals has
  // no citation to resolve. The limit is stated in the finding rather than papered over: the rule
  // runs where every other reference rule in this guard runs.
  const SIGNALS = JSON.parse(
    readFileSync(join(CASES, 'history-checkout-cpu-saturation.signals.json'), 'utf8'),
  ) as Record<string, unknown>;

  function fixture(edit: (fault: Record<string, unknown>) => void): string {
    return corpus({
      signals: JSON.parse(JSON.stringify(SIGNALS)) as Record<string, unknown>,
      mutate: (faultCase) => {
        edit(faultCase.fault as Record<string, unknown>);
      },
    });
  }

  function notesOf(fault: Record<string, unknown>): Record<string, string> {
    return fault.parameterNotes as Record<string, string>;
  }

  it('refuses a key nothing cites and nothing explains, and names the case that needs a note', async () => {
    const result = await run([
      '--cases',
      fixture((fault) => {
        (fault.parameters as Record<string, unknown>).zone = 'euw1-b';
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "'history-checkout-cpu-saturation' declares 'zone' and no reading cites it, and fault.parameterNotes " +
        'says nothing about it',
    );
  });

  it('accepts the same key once the case says what it is for', async () => {
    const result = await run([
      '--cases',
      fixture((fault) => {
        (fault.parameters as Record<string, unknown>).zone = 'euw1-b';
        notesOf(fault).zone = 'where the pod was scheduled, which the ticket names and no series reports.';
      }),
    ]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('explained by a note');
  });

  it('refuses a note beside a citation, because the citation is the statement', async () => {
    const result = await run([
      '--cases',
      fixture((fault) => {
        notesOf(fault).cpuLimit =
          'the limit the container ran at, which the throttling series already holds.';
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("carries a note for 'cpuLimit' and a reading cites it");
  });

  it('refuses a note for a key the case no longer declares', async () => {
    const result = await run([
      '--cases',
      fixture((fault) => {
        notesOf(fault).lagSeconds =
          'the lag the replica reached, left behind by a round that renamed the key.';
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain(
      "explains 'lagSeconds' in fault.parameterNotes, and fault.parameters declares no such key",
    );
  });

  it('refuses a note that is the key again, rather than a sentence', async () => {
    const result = await run([
      '--cases',
      fixture((fault) => {
        notesOf(fault).container = 'the container';
      }),
    ]);
    expect(result.status).toBe(2);
    expect(result.out).toContain("explains 'container' with 'the container', which is a label");
  });

  it('prints cited and explained as a partition of the keys the corpus declares', async () => {
    // Two numbers that must add up, rather than two shares that may not: every key is either spoken
    // for by a reading or explained by a note, and the run is red if any is neither. A line that
    // printed them as percentages could agree while a key fell between the two.
    const result = await run([]);
    expect(result.status, result.out).toBe(0);
    const line =
      /parameters (\d+) of (\d+) \((\d+) percent\) cited by a reading across (\d+) case\(s\); (\d+) explained by a note, shortest (\d+) character\(s\)/.exec(
        result.out,
      );
    expect(line, 'the parameter line is missing from the report').not.toBeNull();
    const [, cited, declared, , cases, noted, shortest] = line!;
    expect(Number(cited) + Number(noted)).toBe(Number(declared));
    expect(Number(cases)).toBe(CORPUS_SIZE);
    expect(Number(cited)).toBeGreaterThan(0);
    expect(Number(noted)).toBeGreaterThan(0);
    expect(
      Number(shortest),
      'a note shorter than a clause is a label the rule would have refused',
    ).toBeGreaterThan(40);
  });
});
