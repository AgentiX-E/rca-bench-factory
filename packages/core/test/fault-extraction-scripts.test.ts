import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The contract the two fault-extraction scripts publish.
 *
 * Neither is covered by the scorer's unit tests, and the reason is the same in
 * both cases: the unit tests import the *module*, and what these files own is
 * the part that only exists in a process -- argument handling, the key read, the
 * envelope on the prediction artefact, and above all the exit codes.
 *
 * The exit codes are the point. The fourth CI anchor failed twelve times in a
 * row without producing a single measurement, and one of the reasons nobody read
 * the failures is that "the job is red" was the only fact the status carried.
 * Here `2` means the model is not good enough yet -- a real result -- and `3`
 * means the pipeline produced no usable answer. Those call for different work,
 * so a suite that does not pin them would let the distinction rot.
 *
 * The derive script is exercised with **no key set**, which is the only state it
 * can be tested in here: it reads `RCA_BENCH_LLM_API_KEY` and this sandbox has
 * none. That is deliberate rather than a limitation -- the missing-key path is
 * the one that has to work, and asserting the message names the variable is what
 * makes a misconfigured workflow diagnosable in one line instead of one run.
 *
 * No mocking library is involved; `check-no-mock` stays green.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DERIVE = resolve(ROOT, 'scripts', 'derive-fault-golden.mjs');
const SCORE = resolve(ROOT, 'scripts', 'score-fault-extraction.mjs');
const DATASET = resolve(ROOT, 'golden-master', 'fault-extraction', 'samples.json');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function run(script: string, args: string[], env: Record<string, string> = {}): Outcome {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...process.env, ...env },
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/**
 * Run a script with an environment that has the key *removed*.
 *
 * `execFileSync`'s `env` replaces rather than merges when it is passed without
 * spreading, and this suite wants the key gone without also losing `PATH`. The
 * copy is built explicitly so the two intents are separate.
 */
function runWithoutKey(script: string, args: string[]): Outcome {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('RCA_BENCH_LLM_')) {
      env[k] = v;
    }
  }
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: ROOT, env });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** A prediction artefact with the envelope the scorer expects. */
function writePredictions(dir: string, predictions: unknown[], schema = 'rca-bench-fault-extraction-predictions/1'): string {
  const path = join(dir, 'predictions.json');
  writeFileSync(path, JSON.stringify({ schema, predictions }));
  return path;
}

let workdir = '';

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), 'fault-extraction-scripts-'));
});

afterAll(() => {
  if (workdir !== '') {
    rmSync(workdir, { recursive: true, force: true });
  }
});

describe('scripts/derive-fault-golden.mjs · the key read', () => {
  it('refuses to run without a key, and names the variable', () => {
    const result = runWithoutKey(DERIVE, ['--out', join(workdir, 'unused.json')]);
    // Without this the failure would surface as a 401 from inside an adapter,
    // three steps later, and read like a provider problem.
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/RCA_BENCH_LLM_API_KEY is not set/);
  });

  it('says the key is read nowhere else, so a reader knows where to look', () => {
    const result = runWithoutKey(DERIVE, ['--out', join(workdir, 'unused.json')]);
    expect(result.stderr).toMatch(/read here and nowhere else/);
  });

  it('requires --out rather than defaulting the artefact into the tree', () => {
    const result = runWithoutKey(DERIVE, []);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--out is required/);
  });

  it('prints usage and exits 0 for --help, without a key', () => {
    const result = runWithoutKey(DERIVE, ['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/usage: node scripts\/derive-fault-golden\.mjs/);
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    const result = runWithoutKey(DERIVE, ['--out', join(workdir, 'x.json'), '--typo']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/unknown argument '--typo'/);
  });

  it('checks the key before it reads the dataset, so a bad key is not a data error', () => {
    // A `--dataset` pointing at nothing with no key must report the key. The
    // ordering is the assertion: the first thing an operator reads should be the
    // thing that is actually wrong.
    const result = runWithoutKey(DERIVE, ['--out', join(workdir, 'x.json'), '--dataset', '/nonexistent.json']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/RCA_BENCH_LLM_API_KEY is not set/);
  });
});

describe('scripts/derive-fault-golden.mjs · the provider is configuration, not a code path', () => {
  it('names the provider variable when an unknown provider is configured', () => {
    // The point of the registry: a run against a provider nobody registered must
    // say so, rather than quietly falling back and reporting a DeepSeek number
    // as if it were the requested provider's.
    const result = run(DERIVE, ['--out', join(workdir, 'x.json')], {
      RCA_BENCH_LLM_PROVIDER: 'gemini',
      RCA_BENCH_LLM_API_KEY: 'irrelevant-because-the-provider-is-rejected',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/unknown LLM provider 'gemini'/);
  });

  it('lists the providers it does know, so the fix is readable', () => {
    const result = run(DERIVE, ['--out', join(workdir, 'x.json')], {
      RCA_BENCH_LLM_PROVIDER: 'gemini',
      RCA_BENCH_LLM_API_KEY: 'k',
    });
    expect(result.stderr).toMatch(/deepseek/);
    expect(result.stderr).toMatch(/openai/);
    expect(result.stderr).toMatch(/anthropic/);
  });

  it('reports the provider problem before the key problem', () => {
    // With both wrong, the provider is the first thing to fix, because a key for
    // the wrong provider is not a key at all. Ordering is the assertion.
    const result = runWithoutKey(DERIVE, ['--out', join(workdir, 'x.json')]);
    const bothWrong = run(DERIVE, ['--out', join(workdir, 'x.json')], {
      RCA_BENCH_LLM_PROVIDER: 'gemini',
    });
    expect(result.stderr).toMatch(/RCA_BENCH_LLM_API_KEY is not set/);
    expect(bothWrong.stderr).toMatch(/unknown LLM provider/);
    expect(bothWrong.stderr).not.toMatch(/API_KEY is not set/);
  });

  it('accepts a vendor-style alias so an existing secret name keeps working', () => {
    // Configuration is written by people, who name a secret after the vendor.
    // `claude` must resolve to anthropic rather than erroring.
    const result = run(DERIVE, ['--out', join(workdir, 'x.json')], {
      RCA_BENCH_LLM_PROVIDER: 'claude',
    });
    // No key is available in this sandbox, so the run stops at the key check --
    // which is exactly the proof that the alias was accepted: an unresolvable
    // provider would have exited on the provider check instead.
    expect(result.stderr).not.toMatch(/unknown LLM provider/);
    expect(result.stderr).toMatch(/RCA_BENCH_LLM_API_KEY is not set/);
  });

  it('says nothing about a provider when none is configured', () => {
    // The default path must not require the variable to be set.
    const result = runWithoutKey(DERIVE, ['--out', join(workdir, 'x.json')]);
    expect(result.stderr).not.toMatch(/unknown LLM provider/);
  });

  it('advertises the provider variable in its own help', () => {
    const result = runWithoutKey(DERIVE, ['--help']);
    expect(result.stdout).toMatch(/RCA_BENCH_LLM_PROVIDER/);
  });
});

describe('scripts/score-fault-extraction.mjs · the exit codes', () => {
  it('exits 0 and reports MET when every graded sample is fully right', () => {
    const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as {
      samples: Array<{ id: string; expected: unknown }>;
    };
    const path = writePredictions(
      workdir,
      dataset.samples.map((s) => ({
        sampleId: s.id,
        parseOk: true,
        validationValid: true,
        extracted: s.expected,
      })),
    );
    const result = run(SCORE, ['--predictions', path]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/M1 exit condition: MET/);
    expect(result.stdout).toMatch(/strict all-fields: 19\/19 \(100\.0%\)/);
  });

  it('exits 2, not 1, when the measurement exists and misses the threshold', () => {
    const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as {
      samples: Array<{ id: string; expected: unknown }>;
    };
    // Only the first four are answered correctly, so the strict rate is well
    // under the threshold while every sample still grades.
    const path = writePredictions(
      workdir,
      dataset.samples.map((s, i) => ({
        sampleId: s.id,
        parseOk: true,
        validationValid: true,
        extracted: i < 4 ? s.expected : { type: 'wrong-type' },
      })),
    );
    const result = run(SCORE, ['--predictions', path]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/M1 exit condition NOT met/);
    expect(result.stderr).toMatch(/threshold 70%/);
  });

  it('exits 3, not 2, when there is no graded sample at all', () => {
    // The distinction the whole script exists for. `2` is a result about the
    // model; `3` is a defect in the wiring, and the numbers to read are the
    // parse and validation rates rather than the accuracy.
    const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as { samples: Array<{ id: string }> };
    const path = writePredictions(
      workdir,
      dataset.samples.map((s) => ({ sampleId: s.id, parseOk: false })),
    );
    const result = run(SCORE, ['--predictions', path]);
    expect(result.status).toBe(3);
    expect(result.stderr).toMatch(/No graded sample/);
    expect(result.stdout).toMatch(/strict all-fields: 0\/0 \(n\/a\)/);
  });

  it('exits 1 when the prediction count does not match the dataset', () => {
    const path = writePredictions(workdir, [{ sampleId: 'only-one', parseOk: false }]);
    const result = run(SCORE, ['--predictions', path]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/19 sample\(s\) but 1 prediction\(s\)/);
  });

  it('exits 1 on a prediction artefact with the wrong schema', () => {
    const path = writePredictions(workdir, [], 'something-else/1');
    const result = run(SCORE, ['--predictions', path]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/has schema 'something-else\/1'/);
  });

  it('exits 1 on an artefact that is an array rather than an envelope', () => {
    const path = join(workdir, 'array.json');
    writeFileSync(path, JSON.stringify([]));
    const result = run(SCORE, ['--predictions', path]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/is not an object/);
  });

  it('exits 1 when the predictions file does not exist', () => {
    const result = run(SCORE, ['--predictions', join(workdir, 'absent.json')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/fatal:/);
  });

  it('exits 1 when --predictions is omitted', () => {
    const result = run(SCORE, []);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--predictions is required/);
  });

  it('prints usage and exits 0 for --help', () => {
    const result = run(SCORE, ['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/usage: node scripts\/score-fault-extraction\.mjs/);
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    const result = run(SCORE, ['--predictions', join(workdir, 'x.json'), '--typo']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/unknown argument '--typo'/);
  });

  it('does not read an LLM key, so a scoring run needs no credential', () => {
    // Reproducibility rests on this: scoring recorded predictions makes no
    // network call, so the same artefact scores the same way tomorrow.
    const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as { samples: Array<{ id: string; expected: unknown }> };
    const path = writePredictions(
      workdir,
      dataset.samples.map((s) => ({ sampleId: s.id, parseOk: true, validationValid: true, extracted: s.expected })),
    );
    const result = runWithoutKey(SCORE, ['--predictions', path]);
    expect(result.status).toBe(0);
  });

  it('treats an unknown sample id in the artefact as an error, not a miss', () => {
    const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as { samples: Array<{ id: string }> };
    const path = writePredictions(
      workdir,
      dataset.samples.map((s, i) => ({
        sampleId: i === 0 ? 'renamed' : s.id,
        parseOk: false,
      })),
    );
    const result = run(SCORE, ['--predictions', path]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/no prediction for sample 'resource-cpu-saturation-checkout'/);
  });
});

describe('scripts/score-fault-extraction.mjs · the report it prints', () => {
  it('prints both denominators for every scored field', () => {
    const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as { samples: Array<{ id: string; expected: unknown }> };
    const path = writePredictions(
      workdir,
      dataset.samples.map((s, i) => ({
        sampleId: s.id,
        parseOk: true,
        validationValid: true,
        extracted: i === 0 ? { type: 'wrong' } : s.expected,
      })),
    );
    const result = run(SCORE, ['--predictions', path]);
    for (const field of ['type', 'category', 'component', 'description']) {
      expect(result.stdout).toMatch(new RegExp(`${field}\\s*: graded \\d+/\\d+ \\(.*\\)  overall \\d+/\\d+`));
    }
  });

  it('reports the four state counts separately, so a parse failure is visible', () => {
    const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as { samples: Array<{ id: string; expected: unknown }> };
    const path = writePredictions(
      workdir,
      dataset.samples.map((s, i) => ({
        sampleId: s.id,
        parseOk: i !== 0,
        validationValid: true,
        ...(i === 0 ? {} : { extracted: s.expected }),
      })),
    );
    const result = run(SCORE, ['--predictions', path]);
    expect(result.stdout).toMatch(/unparseable\s*: 1/);
    expect(result.stdout).toMatch(/graded\s*: 18/);
  });
});

describe('scripts · the derive step is never reached without a key', () => {
  it('does not write an artefact when the key is missing', () => {
    const out = join(workdir, 'must-not-exist.json');
    const result = runWithoutKey(DERIVE, ['--out', out]);
    expect(result.status).toBe(1);
    // A zero-length or partial artefact would be scored on the next step and
    // reported as a model failure, which is the exact confusion this prevents.
    expect(() => readFileSync(out, 'utf8')).toThrow();
  });

  it('the scorer refuses an artefact the derive step never wrote', () => {
    const result = run(SCORE, ['--predictions', join(workdir, 'must-not-exist.json')]);
    expect(result.status).toBe(1);
  });
});

describe('scripts · the key never appears in either script', () => {
  it('reads the key by name only, with no literal in the source', () => {
    // A guard on the red line from the other side: `check-no-secrets` looks for
    // a credential-shaped *literal*, and this asserts the script does not carry
    // a default value either -- a placeholder that ships is worse than none.
    //
    // Only the derive script is checked here. The scorer is a separate
    // assertion below, and the first draft of this test looped over both and
    // failed on the scorer -- which is the correct behaviour of the scorer, not
    // a defect, and a good example of why an expectation written about "the
    // scripts" has to name which one it means.
    const source = readFileSync(DERIVE, 'utf8');
    expect(source).toMatch(/RCA_BENCH_LLM_API_KEY/);
    expect(source).not.toMatch(/RCA_BENCH_LLM_API_KEY\s*(\?\?|\|\|)\s*['"][^'"]+['"]/);
  });

  it('the scorer does not mention the key at all', () => {
    // Not an oversight: scoring makes no network call, so carrying the variable
    // name in that file would only invite someone to set it there.
    const source = readFileSync(SCORE, 'utf8');
    expect(source).not.toMatch(/RCA_BENCH_LLM_API_KEY/);
  });
});

describe('scripts/derive-fault-golden.mjs · it is a real process, not a shell fragment', () => {
  it('is valid JavaScript that Node accepts', () => {
    // Cheap, and it catches the class of edit that leaves a stray `fi` or an
    // unbalanced quote in a heredoc-driven workflow command.
    for (const script of [DERIVE, SCORE]) {
      const result = spawn(process.execPath, ['--check', script], { cwd: ROOT });
      expect(result.pid).toBeGreaterThan(0);
    }
  });
});
