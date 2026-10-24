import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * `scripts/record-reading.mjs`: the transcription step, as a command.
 *
 * The unit tests in `reading-record.test.ts` pin what an entry is. This file pins what the
 * command does with one -- which is the part that can fail in front of a person holding an
 * artefact: it can append a run twice, write an entry for a run the record already calls
 * unreadable, accept a zip and print a stack trace, or exit 0 on a disagreement.
 *
 * Every exit code in the script has a case here, because the script is the only thing between a
 * downloaded artefact and the record the milestone rests on. `gate-sites.json` enumerates the
 * failure exits and `gate-sites-are-proven` requires one proof each; this file is that proof,
 * and it declares itself in `DRIVES` so the cross-check can find it.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'record-reading.mjs');

const DRIVES = ['scripts/record-reading.mjs'];

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'record-reading-'));
  dirs.push(dir);
  return dir;
}

const SAMPLES = [
  { id: 'alpha', incidentText: 'text a', expected: { type: 'cpu-saturation', category: 'resource', component: 'checkout-api' } },
  { id: 'bravo', incidentText: 'text b', expected: { type: 'network-partition', category: 'network', component: 'search-cluster' } },
  { id: 'charlie', incidentText: 'text c', expected: { type: 'network-partition', category: 'network', component: 'ledger-writer' } },
];

/** The expected column, written out again rather than imported -- see the digest test. */
const KEY_DIGEST = 'e0f6a1f6d1e77f4c4a2d1b0a3c5d7e9f0a1b2c3d4e5f60718293a4b5c6d7e8f9';

function datasetPath(): string {
  const path = join(workspace(), 'samples.json');
  writeFileSync(
    path,
    JSON.stringify({ schema: 'rca-bench-fault-golden/2', types: ['cpu-saturation', 'network-partition'], samples: SAMPLES }),
  );
  return path;
}

/** An artefact directory as `unzip` leaves it: one `extraction-predictions.json`. */
function artefactDir(predictions: unknown[]): string {
  const dir = join(workspace(), 'artefact');
  mkdirSync(dir);
  writeFileSync(
    join(dir, 'extraction-predictions.json'),
    JSON.stringify({
      schema: 'rca-bench-fault-extraction-predictions/1',
      dataset: '/somewhere/samples.json',
      provider: 'a-provider',
      model: 'a-model',
      predictions,
    }),
  );
  return dir;
}

function answered(sampleId: string, values: { type?: string; category?: string; component?: string }): unknown {
  return { sampleId, parseOk: true, validationValid: true, extracted: values };
}

/** Three graded answers with one component miss, so strict and component differ. */
function threeAnswers(): unknown[] {
  return [
    answered('alpha', { type: 'cpu-saturation', category: 'resource', component: 'checkout-api' }),
    answered('bravo', { type: 'network-partition', category: 'network', component: 'search-cluster' }),
    answered('charlie', { type: 'network-partition', category: 'network', component: 'message-broker' }),
  ];
}

/** A record shaped like the real file: a schema, a readings array and an absent list. */
function recordFile(input: { readings?: unknown[]; absent?: unknown[] }): string {
  const path = join(workspace(), 'readings.json');
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        schema: 'rca-bench-fault-extraction-readings/1',
        why: 'a record',
        fields: ['type', 'category', 'component'],
        readings: input.readings ?? [],
        absent: input.absent ?? [],
        superseded: [],
        pending: [],
      },
      null,
      2,
    )}\n`,
  );
  return path;
}

/** An entry that matches `threeAnswers()` exactly, as a previous run of the script would write. */
function matchingEntry(run: number): Record<string, unknown> {
  return {
    run,
    model: 'a-model',
    promptChange: 'an earlier change',
    key: { size: 3, digest: KEY_DIGEST },
    totals: { type: 3, category: 3, component: 2, strict: 2 },
    status: 'old-key',
    samples: [
      { id: 'alpha', expected: SAMPLES[0]!.expected, answered: SAMPLES[0]!.expected },
      { id: 'bravo', expected: SAMPLES[1]!.expected, answered: SAMPLES[1]!.expected },
      { id: 'charlie', expected: SAMPLES[2]!.expected, answered: { type: 'network-partition', category: 'network', component: 'message-broker' } },
    ],
  };
}

function run(args: string[]): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe('record-reading --check · the record against the artefact it names', () => {
  it('passes when every answer and total matches', () => {
    const readings = recordFile({ readings: [matchingEntry(1001)] });
    const result = run(['--run', '1001', '--artefact', artefactDir(threeAnswers()), '--dataset', datasetPath(), '--readings', readings, '--check']);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('matches its artefact across 3 sample(s) and four totals');
  });

  it('fails on one wrong answer, naming the sample, the field and both values', () => {
    // The failure the module exists for: a plausible transcription. The message has to be usable
    // without the artefact open beside it.
    const readings = recordFile({ readings: [matchingEntry(1001)] });
    const altered = threeAnswers();
    altered[2] = answered('charlie', { type: 'network-partition', category: 'network', component: 'queue' });
    const result = run(['--run', '1001', '--artefact', artefactDir(altered), '--dataset', datasetPath(), '--readings', readings, '--check']);
    expect(result.status).toBe(2);
    expect(result.out).toContain('FIELD charlie.component: recorded "message-broker", artefact "queue"');
    expect(result.out).toContain('disagrees with its artefact in 1 place(s)');
  });

  it('fails on a row the artefact has no answer for', () => {
    const readings = recordFile({ readings: [matchingEntry(1001)] });
    const short = threeAnswers().slice(0, 2);
    const result = run(['--run', '1001', '--artefact', artefactDir(short), '--dataset', datasetPath(), '--readings', readings, '--check']);
    expect(result.status).toBe(2);
    expect(result.out).toContain('MISSING charlie: recorded "message-broker", artefact null');
  });

  it('fails on a total the recorded rows do not produce', () => {
    // A total is the number downstream quotes and the one no single row contradicts.
    const entry = matchingEntry(1001);
    entry.totals = { type: 3, category: 3, component: 3, strict: 3 };
    const readings = recordFile({ readings: [entry] });
    const result = run(['--run', '1001', '--artefact', artefactDir(threeAnswers()), '--dataset', datasetPath(), '--readings', readings, '--check']);
    expect(result.status).toBe(2);
    expect(result.out).toContain('TOTAL.component: recorded "3", artefact "2"');
  });

  it('refuses to check a run the record does not carry', () => {
    // `--check` compares; it does not add. Silently deriving an entry here would make a typo in a
    // run id look like a successful audit of a run nobody asked about.
    const readings = recordFile({ readings: [matchingEntry(1001)] });
    const result = run(['--run', '2002', '--artefact', artefactDir(threeAnswers()), '--dataset', datasetPath(), '--readings', readings, '--check']);
    expect(result.status).toBe(1);
    expect(result.out).toContain('run 2002 is not in the record');
  });
});

describe('record-reading --write · one run, one entry, in run order', () => {
  it('derives the entry, writes it, and places it by run id', () => {
    // Placed rather than appended: the record's contract is run order, and the tool is used to
    // backfill a run older than every entry in the file.
    const readings = recordFile({ readings: [matchingEntry(1001)] });
    const result = run([
      '--run', '500',
      '--artefact', artefactDir(threeAnswers()),
      '--dataset', datasetPath(),
      '--readings', readings,
      '--status', 'current',
      '--prompt-change', 'a change under measurement',
      '--prompt-digest', 'b'.repeat(64),
      '--write',
    ]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('at position 1 of 2');
    const written = JSON.parse(readFileSync(readings, 'utf8')) as {
      readings: Array<Record<string, unknown>>;
    };
    expect(written.readings.map((entry) => entry.run)).toEqual([500, 1001]);
    expect(written.readings[0]).toMatchObject({
      run: 500,
      model: 'a-model',
      promptChange: 'a change under measurement',
      key: { size: 3 },
      totals: { type: 3, category: 3, component: 2, strict: 2 },
      status: 'current',
      promptDigest: 'b'.repeat(64),
    });
  });

  it('takes the model from --model when the artefact does not name one', () => {
    const readings = recordFile({});
    const dir = artefactDir(threeAnswers());
    const file = join(dir, 'extraction-predictions.json');
    const payload = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    delete payload.model;
    writeFileSync(file, JSON.stringify(payload));
    const result = run([
      '--run', '600',
      '--artefact', dir,
      '--dataset', datasetPath(),
      '--readings', readings,
      '--status', 'old-key',
      '--prompt-change', 'a change',
      '--model', 'a-named-model',
      '--write',
    ]);
    expect(result.status, result.out).toBe(0);
    const written = JSON.parse(readFileSync(readings, 'utf8')) as { readings: Array<{ model: string }> };
    expect(written.readings[0]?.model).toBe('a-named-model');
  });

  it('refuses a run that is already recorded', () => {
    // Two entries for one run would make "in run order" false and would let a re-derivation
    // replace a measurement with a later transcription of the same artefact.
    const readings = recordFile({ readings: [matchingEntry(1001)] });
    const result = run([
      '--run', '1001',
      '--artefact', artefactDir(threeAnswers()),
      '--dataset', datasetPath(),
      '--readings', readings,
      '--status', 'current',
      '--prompt-change', 'a change',
      '--write',
    ]);
    expect(result.status).toBe(1);
    expect(result.out).toContain('already recorded');
  });

  it('refuses a run the record calls absent, and says the claim has to be removed with it', () => {
    // `absent` says the artefact is gone. Leaving the claim beside a reading made from that
    // artefact would leave two contradictory statements in one file.
    const readings = recordFile({ absent: [{ run: 700, why: 'the artefact was not kept, so it is named rather than reconstructed' }] });
    const result = run([
      '--run', '700',
      '--artefact', artefactDir(threeAnswers()),
      '--dataset', datasetPath(),
      '--readings', readings,
      '--status', 'old-key',
      '--prompt-change', 'a change',
      '--write',
    ]);
    expect(result.status).toBe(1);
    expect(result.out).toContain("named in 'absent' as unreadable");
  });

  it('refuses a run that is not wholly graded, rather than writing a total that disagrees', () => {
    const readings = recordFile({});
    const answers = threeAnswers();
    answers[1] = { sampleId: 'bravo', parseOk: false, parseError: 'the response was not JSON' };
    const result = run([
      '--run', '800',
      '--artefact', artefactDir(answers),
      '--dataset', datasetPath(),
      '--readings', readings,
      '--status', 'current',
      '--prompt-change', 'a change',
      '--write',
    ]);
    expect(result.status).toBe(3);
    expect(result.out).toContain('bravo (unparseable)');
    expect(readFileSync(readings, 'utf8')).toContain('"readings": []');
  });
});

describe('record-reading · the inputs it will not guess at', () => {
  it('prints the entry and writes nothing when neither --write nor --check is given', () => {
    const readings = recordFile({});
    const before = readFileSync(readings, 'utf8');
    const result = run([
      '--run', '900',
      '--artefact', artefactDir(threeAnswers()),
      '--dataset', datasetPath(),
      '--readings', readings,
      '--status', 'old-key',
      '--prompt-change', 'a change',
    ]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('"strict": 2');
    expect(readFileSync(readings, 'utf8')).toBe(before);
  });

  it('refuses a zip and names the command that unpacks it', () => {
    const readings = recordFile({});
    const result = run(['--run', '1', '--artefact', '/tmp/run.zip', '--dataset', datasetPath(), '--readings', readings, '--check']);
    expect(result.status).toBe(1);
    expect(result.out).toContain('unzip -o /tmp/run.zip -d <dir>');
  });

  it('refuses an artefact whose schema is not the one the deriver writes', () => {
    const readings = recordFile({});
    const dir = join(workspace(), 'bad');
    mkdirSync(dir);
    writeFileSync(join(dir, 'extraction-predictions.json'), JSON.stringify({ schema: 'something-else', predictions: [] }));
    const result = run(['--run', '1', '--artefact', dir, '--dataset', datasetPath(), '--readings', readings, '--check']);
    expect(result.status).toBe(1);
    expect(result.out).toContain("has schema 'something-else'");
  });

  it('refuses an artefact directory with no predictions file in it', () => {
    const readings = recordFile({});
    const dir = join(workspace(), 'empty');
    mkdirSync(dir);
    const result = run(['--run', '1', '--artefact', dir, '--dataset', datasetPath(), '--readings', readings, '--check']);
    expect(result.status).toBe(1);
    expect(result.out).toContain('extraction-predictions.json');
  });

  it('refuses an artefact object with no predictions array', () => {
    const readings = recordFile({});
    const dir = join(workspace(), 'nopred');
    mkdirSync(dir);
    writeFileSync(
      join(dir, 'extraction-predictions.json'),
      JSON.stringify({ schema: 'rca-bench-fault-extraction-predictions/1' }),
    );
    const result = run(['--run', '1', '--artefact', dir, '--dataset', datasetPath(), '--readings', readings, '--check']);
    expect(result.status).toBe(1);
    expect(result.out).toContain("has no 'predictions' array");
  });

  it('accepts the predictions file directly as --artefact', () => {
    const readings = recordFile({ readings: [matchingEntry(1001)] });
    const dir = artefactDir(threeAnswers());
    const result = run([
      '--run', '1001',
      '--artefact', join(dir, 'extraction-predictions.json'),
      '--dataset', datasetPath(),
      '--readings', readings,
      '--check',
    ]);
    expect(result.status, result.out).toBe(0);
  });

  it('requires a run id, an artefact, a status and a prompt change', () => {
    const dataset = datasetPath();
    const readings = recordFile({});
    const artefact = artefactDir(threeAnswers());
    const cases: Array<[string[], string]> = [
      [['--artefact', artefact, '--dataset', dataset, '--readings', readings, '--check'], '--run is required'],
      [['--run', '1', '--dataset', dataset, '--readings', readings, '--check'], '--artefact is required'],
      [['--run', '1', '--artefact', artefact, '--dataset', dataset, '--readings', readings], '--status is required'],
      [['--run', '1', '--artefact', artefact, '--dataset', dataset, '--readings', readings, '--status', 'current'], '--prompt-change is required'],
      [['--run', 'abc', '--artefact', artefact, '--dataset', dataset, '--readings', readings, '--check'], 'takes a run id'],
      [['--run', '1', '--artefact', artefact, '--dataset', dataset, '--readings', readings, '--check', '--write'], 'pass one'],
      [['--run', '1', '--artefact', artefact, '--nonsense', 'x'], "unknown argument '--nonsense'"],
      [['--run'], '--run needs a value'],
      [['--run', '--artefact', artefact], '--run needs a value'],
    ];
    for (const [args, expected] of cases) {
      const result = run(args);
      expect(result.status, `${args.join(' ')}: ${result.out}`).toBe(1);
      expect(result.out, args.join(' ')).toContain(expected);
    }
  });

  it('refuses a dataset it cannot parse', () => {
    const readings = recordFile({});
    const broken = join(workspace(), 'broken.json');
    writeFileSync(broken, 'not json');
    const result = run(['--run', '1', '--artefact', artefactDir(threeAnswers()), '--dataset', broken, '--readings', readings, '--check']);
    expect(result.status).toBe(1);
    expect(result.out).toContain('could not read the dataset');
  });

  it('refuses a record it cannot parse', () => {
    const broken = join(workspace(), 'record.json');
    writeFileSync(broken, 'not json');
    const result = run(['--run', '1', '--artefact', artefactDir(threeAnswers()), '--dataset', datasetPath(), '--readings', broken, '--check']);
    expect(result.status).toBe(1);
    expect(result.out).toContain('could not read the record');
  });

  it('explains itself on --help without touching anything', () => {
    const result = run(['--help']);
    expect(result.status).toBe(0);
    expect(result.out).toContain('usage: node scripts/record-reading.mjs');
  });
});
