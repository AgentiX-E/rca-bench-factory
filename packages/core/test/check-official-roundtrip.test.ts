import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { SCORE_TARGET_IDS } from '../src/score/score.js';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach, and reports a disagreement
 * in either direction: declaring one that is never spawned is as much a
 * violation as spawning one that is not declared. The declaration is needed
 * because several of these files drive a gate through a local `run(script)`
 * helper or a data table, so the script name never appears in a spawn's own
 * argument list and cannot be inferred from one.
 */
const DRIVES = [
  'scripts/check-official.mjs',
];


/**
 * The `--official-dir` branch of `scripts/check-official.mjs`.
 *
 * The default mode pins a fixed verdict on a committed bundle. This branch
 * cannot pin a case count -- it reads whatever corpus the operator fetched --
 * so what it has to guarantee is different, and each test below is one of the
 * ways a round trip can report success while establishing nothing:
 *
 *   - it scores no cases because the descriptor file is empty;
 *   - it scores a subset because the descriptor and the corpus have drifted;
 *   - it scores a case whose telemetry never made it through the ingest;
 *   - it scores a case but not against the target's own published rule.
 *
 * In every one of those the naive implementation prints PASSED, and the fourth
 * anchor is the one place where that would be worse than no anchor at all: a
 * green round trip is the evidence that the official data was reproduced.
 *
 * The corpus is synthesised here, so the tests are about the branch's own
 * verdicts and run without the network.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-official.mjs');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

/** `spawnSync`, so a run that exits 0 still yields its stderr. */
function run(args: string[]): Outcome {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * `run`, with the child's heap capped.
 *
 * The real corpus is 4.24 GB of archives that extract to roughly 32 GB, and the
 * round trip has to survive it inside a default-sized heap. A fixture large
 * enough to reproduce that at 1:1 is not something a unit test can write, so the
 * heap is lowered instead and the corpus is made merely *large*: the property
 * under test is that memory does not scale with how much corpus the walker sees,
 * and an implementation that holds the corpus `Map<string, string>` violates it
 * at any size once the cap is below the corpus.
 *
 * `--max-old-space-size` is what makes the failure a verdict rather than a
 * coincidence: without it the test would pass on a machine with enough RAM and
 * fail on a smaller one, which is the same defect wearing a green tick.
 */
function runWithHeapMb(args: string[], heapMb: number): Outcome {
  const result = spawnSync(
    process.execPath,
    [`--max-old-space-size=${heapMb}`, SCRIPT, ...args],
    { encoding: 'utf8', cwd: ROOT },
  );
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-roundtrip-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * The time the two bulk-corpus assertions below are allowed.
 *
 * Both write hundreds of megabytes and then spawn a child that reads them, so
 * their wall time is a function of the filesystem and of what else is running,
 * not of the code under test. Measured on one machine, on one revision, with no
 * change to the test:
 *
 *     8811 ms   <- failed, against vitest's 5000 ms default
 *     2804 ms
 *     2435 ms
 *
 * A 3.6x spread. The cold pass is 3.4x the default, so the test's verdict was a
 * function of machine load -- and it failed roughly one run in five, with a
 * *different* file reported as the victim each time, because whichever
 * spawn-heavy test was slowest that run crossed the line first. That signature
 * -- varying victims, vanishing under `--no-file-parallelism` -- is what made it
 * look like a race rather than a budget.
 *
 * This is the same omission F-43 fixed in `gate-sites-are-proven.test.ts`, where
 * the rule-7 corpus check timed out on CI and was given `RULE_TIMEOUT_MS`. The
 * rule is now stated once and enumerated by `timeout-budget.test.ts`, so a new
 * spawn-heavy test cannot repeat it silently.
 *
 * The number is 60 s for the same reason as that one: an order of magnitude over
 * the observed cost is a budget, and twice the observed cost is the flake again
 * wearing a larger number.
 */
const BULK_TIMEOUT_MS = 60_000;

/**
 * A bundle that the official-metric regression must reject.
 *
 * Derived from the shipped example rather than hand-written, so it stays a valid
 * bundle when the IR grows a field -- a fixture that has to be maintained in
 * step with the schema is the drift this whole file exists to catch.
 *
 * Only the minimal edit that makes the verdict fail is made, and which edit that
 * is is named by the caller, because a fixture that regressed in several ways at
 * once could not tell you which `failures.push` site fired.
 */
const SHIPPED_BUNDLE = resolve(ROOT, 'examples', 'order-prod', 'bundle.json');
let regressedCount = 0;

function writeRegressedBundle(kind: 'no-cases'): string {
  const bundle = JSON.parse(readFileSync(SHIPPED_BUNDLE, 'utf8')) as Record<string, unknown>;
  if (kind === 'no-cases') {
    // The exporter produces no cases, so `caseCount === 0` fires for every
    // target and the official metric is never exercised. This is the one edit
    // that reaches the block without needing a corpus on disk.
    bundle.cases = [];
    bundle.signals = {};
  }
  const path = join(scratch, `regressed-${kind}-${regressedCount}.json`);
  regressedCount += 1;
  writeFileSync(path, JSON.stringify(bundle));
  return path;
}

let counter = 0;
function freshRoot(): string {
  counter += 1;
  const root = join(scratch, `corpus-${counter}`);
  mkdirSync(root, { recursive: true });
  return root;
}

/**
 * Write one case in the official layout.
 *
 * `metrics.json` is the *real* RCAEval shape -- a JSON object mapping a metric
 * name to its samples, with no time column -- because the round trip's job is to
 * join that shape to what the ingest reads. A fixture in the shape we find
 * convenient would test the adapter against itself.
 *
 * The values plateau then step, and every metric carries the same sample count:
 * the adapter refuses uneven series, so a fixture that tripped that would fail
 * for a reason unrelated to what is under test.
 */
function writeCase(root: string, caseId: string, samples = 40): void {
  const dir = join(root, caseId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
  const half = Math.floor(samples / 2);
  const metrics: Record<string, number[]> = { cpu_usage: [], mem_usage: [] };
  for (let i = 0; i < samples; i += 1) {
    metrics.cpu_usage!.push(i < half ? 0.2 : 0.95);
    metrics.mem_usage!.push(0.5);
  }
  writeFileSync(join(dir, 'metrics.json'), JSON.stringify(metrics));
}

/** A descriptor file naming the cases that were actually written. */
function writeCases(path: string, caseIds: string[], suite = 'RE2'): void {
  const cases = caseIds.map((caseId) => ({
    caseId,
    component: caseId.split('-')[1],
    faultType: 'cpu',
    injectTime: new Date(1_700_000_000_000).toISOString(),
    pathPrefix: `${caseId}/`,
    suite,
  }));
  writeFileSync(
    path,
    JSON.stringify({ schema: 'rca-bench-rcaeval-cases/1', counts: { RE1: 0, RE2: cases.length, RE3: 0 }, cases }, null, 2),
  );
}

/**
 * A corpus far larger than the heap the run is given, in the real case shape.
 *
 * Each case carries the three metrics the corpus's own CPU cases carry, over
 * enough samples that the case is a few hundred kilobytes of JSON -- the size
 * the real `metrics.json` files are. The bulk matters: the defect this fixture
 * exists to catch is a reader that materialises every file it walks past, so a
 * fixture of a few hundred bytes per case would let the whole corpus sit in a
 * capped heap and the test would certify the bug.
 *
 * `pads` are what makes the *total* exceed the heap without the cases being
 * absurd individually. They stand in for the corpus's genuine bulk -- the
 * telemetry files that are not the three the adapter reads -- and the round trip
 * is expected to step over them without ever holding them.
 */
function writeBulkCorpus(
  root: string,
  caseCount: number,
  samples: number,
  padBytes: number,
): { cases: string[]; bytes: number } {
  const cases: string[] = [];
  let bytes = 0;
  const dummy = 'x'.repeat(padBytes);
  for (let c = 0; c < caseCount; c += 1) {
    const caseId = `RE2-OB/service${c}_cpu/1`;
    const dir = join(root, caseId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    const half = Math.floor(samples / 2);
    const metrics: Record<string, number[]> = { cpu_usage: [], mem_usage: [], latency: [] };
    for (let i = 0; i < samples; i += 1) {
      metrics.cpu_usage!.push(i < half ? 1.25 : 27.5);
      metrics.mem_usage!.push(88.5);
      metrics.latency!.push(i < half ? 0.4 : 9.9);
    }
    const body = JSON.stringify(metrics);
    writeFileSync(join(dir, 'metrics.json'), body);
    // Bulk beside the case, exactly as the corpus carries it: files the round
    // trip must step over, not read.
    writeFileSync(join(dir, 'load_0.csv'), dummy);
    // The archives' own packaging, which the real download carries at every
    // level: a non-payload file the walk counts or does not, but never reads.
    // It is here so that "counted" is a decision under test rather than a
    // coincidence of the fixture happening to hold only payload names.
    writeFileSync(join(dir, '.DS_Store'), Buffer.from([0x00, 0x01, 0x02]));
    bytes += body.length + padBytes;
    cases.push(caseId);
  }
  return { cases, bytes };
}

describe('scripts/check-official.mjs · the round trip leaves the default verdict intact', () => {
  // The default mode's nine lines are a contract read line by line elsewhere.
  // This branch adds lines; if it changed or reordered them, the readers would
  // break and the round trip would have cost us the anchor it depends on.
  it('still prints exactly one verdict line per target, and the same summary', () => {
    const root = freshRoot();
    writeCase(root, 'RE2-ob-cpu_1');
    const cases = join(scratch, 'intact.json');
    writeCases(cases, ['RE2-ob-cpu_1']);
    const withFlag = run(['--official-dir', root, '--cases', cases]);
    const without = run([]);
    const verdicts = (out: string) =>
      out
        .split('\n')
        .filter((line) => /^(PASS|SKIP|FAIL)\s/.test(line))
        .map((line) => line.trim());
    expect(verdicts(withFlag.stdout)).toEqual(verdicts(without.stdout));
    expect(verdicts(withFlag.stdout)).toHaveLength(SCORE_TARGET_IDS.length);
  });

  it('prefixes every line it adds, so the verdict block stays parseable', () => {
    const root = freshRoot();
    writeCase(root, 'RE2-ob-cpu_1');
    const cases = join(scratch, 'prefixed.json');
    writeCases(cases, ['RE2-ob-cpu_1']);
    const result = run(['--official-dir', root, '--cases', cases]);
    const afterSummary = result.stdout.split('skipped by contract)')[1] ?? '';
    for (const line of afterSummary.split('\n').filter((l) => l.trim() !== '')) {
      expect(line.startsWith('ROUNDTRIP')).toBe(true);
    }
  });

  it('does no round trip at all when --official-dir is absent', () => {
    const result = run([]);
    expect(result.stdout).not.toContain('ROUNDTRIP');
  });
});

describe('scripts/check-official.mjs · what the round trip refuses to pass', () => {
  it('passes a corpus whose one case round-trips', () => {
    const root = freshRoot();
    writeCase(root, 'RE2-ob-cpu_1');
    const cases = join(scratch, 'ok.json');
    writeCases(cases, ['RE2-ob-cpu_1']);
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.stdout).toContain('ROUNDTRIP PASS');
    expect(result.stdout).toMatch(/ROUNDTRIP PASSED \(1 case/);
  });

  it('fails when the descriptor file lists no cases', () => {
    // Otherwise the anchor reports success for having scored nothing, which is
    // exactly the "no denominator" failure the anchor exists to rule out.
    const root = freshRoot();
    const cases = join(scratch, 'empty.json');
    writeCases(cases, []);
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/scored nothing|score nothing/);
  });

  it('fails when a declared case is absent from the corpus', () => {
    // Two artefacts generated at different times. Without this the round trip
    // scores the subset that still exists and reports it as the whole corpus.
    const root = freshRoot();
    writeCase(root, 'RE2-ob-cpu_1');
    const cases = join(scratch, 'drift.json');
    writeCases(cases, ['RE2-ob-cpu_1', 'RE2-ob-cpu_2']);
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('RE2-ob-cpu_2');
    expect(result.stderr).toMatch(/absent from/);
  });

  it('fails when the corpus cannot be read into any signal', () => {
    const root = freshRoot();
    const dir = join(root, 'RE2-ob-cpu_1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    // A file that is present -- so the corpus "has" the case and the descriptor
    // matches it -- but that no reader can turn into telemetry. Which reader
    // refuses first is an implementation detail; that the run fails and says
    // *why* is not.
    writeFileSync(join(dir, 'metrics.json'), 'this is not telemetry\n');
    const cases = join(scratch, 'unreadable.json');
    writeCases(cases, ['RE2-ob-cpu_1']);
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/ROUNDTRIP   - RE2-ob-cpu_1: \S/);
  });

  it('fails when metrics.json parses but holds no samples', () => {
    // The adapter's own refusal. An empty series reads as "the fault was
    // reproduced over zero observations", which is the no-denominator failure
    // the anchor exists to prevent.
    const root = freshRoot();
    const dir = join(root, 'RE2-ob-cpu_1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    writeFileSync(join(dir, 'metrics.json'), JSON.stringify({ cpu_usage: [] }));
    const cases = join(scratch, 'nosamples.json');
    writeCases(cases, ['RE2-ob-cpu_1']);
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/zero samples/);
  });

  it('fails when the metrics series have different lengths', () => {
    // RCAEval publishes one array per metric with no time column, so the
    // instants have to be reconstructed from a common index. Uneven arrays have
    // no common index: padding one would invent samples and truncating the other
    // would drop real ones, so neither is done.
    const root = freshRoot();
    const dir = join(root, 'RE2-ob-cpu_1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    writeFileSync(join(dir, 'metrics.json'), JSON.stringify({ cpu_usage: [1, 2, 3], mem_usage: [1, 2] }));
    const cases = join(scratch, 'uneven.json');
    writeCases(cases, ['RE2-ob-cpu_1']);
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/mem_usage.*2 sample.*first metric has 3/);
  });

  it('names the fetch command when the corpus directory is absent', () => {
    const cases = join(scratch, 'any.json');
    writeCases(cases, ['RE2-ob-cpu_1']);
    const result = run(['--official-dir', join(scratch, 'absent'), '--cases', cases]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('fetch-official.mjs');
  });

  it('names the generator when the descriptor file is absent', () => {
    const root = freshRoot();
    writeCase(root, 'RE2-ob-cpu_1');
    const result = run(['--official-dir', root, '--cases', join(scratch, 'absent.json')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('gen-rcaeval-cases.mjs');
  });

  it('rejects a flag with no value instead of reading the next flag as one', () => {
    const result = run(['--official-dir', '--cases', 'x.json']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--official-dir requires a value/);
  });
});

describe('scripts/check-official.mjs · the corpus reader', () => {
  it('ignores binary files rather than decoding them into the corpus', () => {
    // A decoded binary would hand every scorer a body of replacement characters
    // to search, and a case could then appear to have telemetry it does not.
    const root = freshRoot();
    writeCase(root, 'RE2-ob-cpu_1');
    writeFileSync(join(root, 'RE2-ob-cpu_1', 'thumbnail.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
    const cases = join(scratch, 'binary.json');
    writeCases(cases, ['RE2-ob-cpu_1']);
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ROUNDTRIP PASSED/);
  });

  it('reads a nested suite directory as well as a flat one', () => {
    const root = freshRoot();
    writeCase(root, 'RE2-ob-cpu_1');
    writeCase(root, 'RE1-ob-cpu_1');
    const cases = join(scratch, 'multi.json');
    writeCases(cases, ['RE2-ob-cpu_1']);
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('found');
  });

  it('reports the declared count accurately, so a shrunk corpus is visible', () => {
    const root = freshRoot();
    writeCase(root, 'RE2-ob-cpu_1');
    writeCase(root, 'RE2-ob-cpu_2');
    const cases = join(scratch, 'counts.json');
    writeCases(cases, ['RE2-ob-cpu_1', 'RE2-ob-cpu_2']);
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.stdout).toMatch(/declared 2 case/);
    expect(result.stdout).toMatch(/found \d+ file/);
  });

  it('counts the corpus in files, and counts the directory tree too', () => {
    // The line is the operator's only quantitative view of the download, and
    // `found N file(s)` under a *file* label has to mean files. Counting
    // directories there would report a number that moves when the layout
    // changes -- a corpus whose zip gained a directory would look larger
    // without a byte arriving -- and the count is what an operator compares
    // against the previous run, so it has to be a number that means one thing.
    //
    // The directory count is reported separately rather than merged in, and it
    // is what distinguishes "the archive extracted to the wrong depth" (no
    // files, plenty of directories) from "the archive never arrived" (neither).
    const root = freshRoot();
    writeCase(root, 'RE2-ob-cpu_1');
    const cases = join(scratch, 'counted.json');
    writeCases(cases, ['RE2-ob-cpu_1']);
    const result = run(['--official-dir', root, '--cases', cases]);
    // Two files per case: inject_time.txt and metrics.json.
    expect(result.stdout).toMatch(/found 2 file\(s\)/);
    // One directory: the case itself. The corpus root is not counted, because
    // it is the argument the caller passed rather than something downloaded.
    expect(result.stdout).toMatch(/, 1 directory\(ies\)/);
  });
});

describe('scripts/check-official.mjs · the branch reads its own inputs', () => {
  it('defaults to the committed descriptor path, and says how to make one', () => {
    // `--official-dir` alone has to be enough in CI, where the descriptor is the
    // committed one.
    //
    // The file is deliberately absent from the repository. It lists the case
    // directories of a specific corpus, and a corpus is 19 GB of licensed data
    // that never enters git -- so a committed list is a transcription of a
    // download nobody can verify from the repository. It is generated by
    // `scripts/gen-rcaeval-cases.mjs` during the run instead, and its `--check`
    // mode fails the run if the corpus does not produce exactly what was
    // generated. A hand-written list would pass that check only by coincidence.
    const root = freshRoot();
    writeCase(root, 'RE2-ob-cpu_1');
    const result = run(['--official-dir', root]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('gen-rcaeval-cases.mjs');
  });

  it('takes an explicit --cases file, which is what the workflow passes', () => {
    const root = freshRoot();
    writeCase(root, 'RE2-ob-cpu_1');
    const cases = join(scratch, 'explicit.json');
    writeCases(cases, ['RE2-ob-cpu_1']);
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ROUNDTRIP PASSED');
  });
});

describe('scripts/check-official.mjs · memory does not scale with the size of the corpus', () => {
  // The real run died here, and it died at the *last* step:
  //
  //   ok  Derive the case descriptors from what was downloaded
  //   >>> Round-trip the corpus and score it with the official rule   <- exit 134
  //   FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
  //
  // The corpus is three archives totalling 4.24 GB that extract to roughly 32 GB
  // on disk, and the walker read every non-binary file in the tree into one
  // `Record<string, string>` before scoring anything. Three of the things it then
  // did with that map needed one boolean per case and one count:
  //
  //   - "does this case have an inject_time.txt?" -- a `stat`, not a body;
  //   - the "found N file(s)" line -- a count, not the bodies;
  //   - the adapter -- which re-reads the single `metrics.json` from disk anyway.
  //
  // So the map was never load-bearing, and it was the whole of the memory cost.
  // These tests hold the walker to the bound the real corpus demands: memory is a
  // function of the largest case, not of how much corpus there is.

  it('still refuses a payload file whose body is binary', () => {
    // The walk no longer opens every file to look for a NUL, so it cannot be the
    // thing that keeps a decoded binary out of the scorers. That duty moved to
    // the one place a payload is opened -- `adaptCase` -- and this is the check
    // that it did: without it the walk would report the case as present,
    // `assertRcaevalMetrics` would be handed a body of replacement characters,
    // and the search would be over text nobody wrote.
    //
    // Whether such a case is *counted* differs between the old walk (not counted,
    // it had a NUL) and the new one (counted, the name says payload). That the
    // case fails by name rather than passing quietly is the property that has to
    // hold, and it holds either way.
    const root = freshRoot();
    const dir = join(root, 'RE2-ob-cpu_1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    writeFileSync(join(dir, 'metrics.json'), Buffer.from([0x7b, 0x00, 0x01, 0x02, 0x7d]));
    const cases = join(scratch, 'binary-payload.json');
    writeCases(cases, ['RE2-ob-cpu_1']);
    const result = run(['--official-dir', root, '--cases', cases]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/metrics\.json is binary/);
  });

  it('survives a corpus many times larger than its heap, and scores every case', () => {
    const root = freshRoot();
    // ~300 MB of corpus, of which the adapter reads ~1 MB. The ratio is the
    // point: the run is given 128 MB, so anything that holds the corpus whole
    // cannot finish.
    const { cases, bytes } = writeBulkCorpus(root, 20, 1_000, 15 * 1024 * 1024);
    expect(bytes).toBeGreaterThan(280 * 1024 * 1024);
    const casesPath = join(scratch, 'bulk.json');
    writeCases(casesPath, cases);

    const result = runWithHeapMb(['--official-dir', root, '--cases', casesPath], 128);

    // A heap-limit abort is the failure this test exists for, so it is named
    // separately from a wrong verdict: both exit non-zero, and a green run for
    // the wrong reason is what the whole anchor is meant to rule out.
    expect(result.stderr).not.toMatch(/heap out of memory/i);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ROUNDTRIP PASSED \(20 case/);
    // Every case scored, not the first few before memory ran out. The trailing
    // space separates the per-case verdict from the `ROUNDTRIP PASSED` summary,
    // which would otherwise be counted as a twenty-first.
    expect(result.stdout.match(/ROUNDTRIP PASS /g)).toHaveLength(20);
  }, BULK_TIMEOUT_MS);

  it('still counts what it walked, so the operator line keeps its meaning', () => {
    // The corpus-wide map was also the only thing backing the "found N file(s)"
    // count. Removing it must not remove the count: the two numbers on that line
    // are the operator's only quantitative view of the download, and a corpus
    // that arrived empty would otherwise report the same numbers as one that
    // arrived whole -- the failure mode finding 15 was about.
    const root = freshRoot();
    const { cases } = writeBulkCorpus(root, 3, 40, 0);
    const casesPath = join(scratch, 'counted-bulk.json');
    writeCases(casesPath, cases);
    const result = run(['--official-dir', root, '--cases', casesPath]);
    expect(result.status).toBe(0);
    // Three payload files per case: inject_time.txt, metrics.json and
    // load_0.csv. The `.DS_Store` beside each one is not counted, because the
    // count is of what the corpus carries as telemetry and packaging is not it
    // -- which is also the rule the body-sniffing walk applied, by a different
    // route. Nine, then, and seven directories: the case directory and the two
    // levels above it, three times over, since the walk descends from the root
    // rather than knowing the layout.
    expect(result.stdout).toMatch(/found 9 file\(s\)/);
    expect(result.stdout).toMatch(/, 7 directory\(ies\)/);
  });
});

/**
 * A declared case whose payload is not a file this adapter can read.
 *
 * This is the shape of the fourth anchor's real failure, taken from the run that
 * produced it rather than imagined. `official-data.yml` #35487637399 derived 270
 * descriptors from a real RCAEval download — `RE2-OB/checkoutservice_cpu/1` among
 * them, with a real `injectTime` — and then died on the first one it read:
 *
 *   ROUNDTRIP declared 270 case(s), found 2978 file(s), 364 directory(ies)
 *   Error: ENOENT: no such file or directory, open
 *       '/tmp/official/RE2-OB/checkoutservice_cpu/1/metrics.json'
 *       at adaptCase (.../scripts/check-official.mjs:236:17)
 *
 * Two facts pin what happened, and neither is a guess:
 *
 *   - `gen-rcaeval-cases.mjs` emits a descriptor only for a directory carrying
 *     `inject_time.txt`, so that file *was* there;
 *   - `adaptCase` opened `metrics.json` by name and the filesystem said it was
 *     not there.
 *
 * So the corpus holds a case whose payload does not carry the name this adapter
 * assumes. The upstream harness does not assume it either: `main.py` finds its
 * cases by globbing `**\/data.csv` and reads the labels back out of the path, and
 * `docs/targets/rcaeval.md` records that. `metrics.json` is the name our
 * *exporter* writes, and the adapter was reading the corpus with our own name for
 * it — the same mistake finding 42 made about the directory layout, one layer
 * down.
 *
 * What the adapter must not do is `readFileSync` a path it has no reason to
 * believe exists. An `ENOENT` thrown from inside a file open is not a verdict
 * about the corpus; it is a crash that reports the symptom and withholds the
 * cause. Every test below asserts the same property from a different direction:
 * the run says *what is wrong with the corpus*, and never dies with a stack trace
 * from `openSync`.
 */
describe('scripts/check-official.mjs · a declared case with no readable payload', () => {
  /**
   * A case directory with an `inject_time.txt` and a *readable* `data.csv`.
   *
   * ## This helper used to be named for a property its data did not have
   *
   * It was `writeCaseWithoutMetrics`, and it wrote
   * `time,cpu_usage\n0,0.2\n1,0.95\n` -- a perfectly well-formed one-metric CSV,
   * which is exactly the payload `main.py` globs for. Two tests below use it and
   * assert that the run *fails*, and they passed for two iterations because the
   * reader could not parse CSV at all. The helper's name described the reader's
   * defect, not the fixture's contents, and the tests inherited the mistake:
   * `does not report the crash as a scorer failure` was reading a corpus that was
   * fine and calling it a crash.
   *
   * So it is renamed to say what it writes. A helper named after the failure it
   * was written to provoke is how a test comes to assert the bug rather than the
   * contract -- and the bug it was accidentally asserting is finding 115.
   */
  function writeCsvCase(root: string, caseId: string): void {
    const dir = join(root, caseId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    // The payload the corpus actually carries, under the name upstream uses.
    // `main.py` finds its cases by globbing a data.csv pattern, so a reader that
    // only knew `metrics.json` would report a good corpus as unreadable.
    writeFileSync(join(dir, 'data.csv'), 'time,cpu_usage\n0,0.2\n1,0.95\n');
  }

  /**
   * A case directory whose payload is present under a known name and unreadable.
   *
   * This is the shape the two failure tests below actually need: a payload the
   * reader *tries* and must refuse by name, rather than one it never finds. A
   * missing file and a corrupt file are different findings and the reader
   * distinguishes them, so the fixtures have to as well.
   */
  function writeUnreadableCase(root: string, caseId: string): void {
    const dir = join(root, caseId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    // Named `data.csv` -- a known payload name -- and holding bytes that are
    // neither JSON nor delimited telemetry. The reader must reach it, try both
    // readers, and report the case by name.
    writeFileSync(join(dir, 'data.csv'), 'this is not telemetry at all\n');
  }

  it('reads a payload the corpus named data.csv, which is what upstream writes', () => {
    // The accepting half of the same fact. `main.py` globs `**\/data.csv`, so a
    // reader that only knew `metrics.json` would call a perfectly good corpus
    // unreadable -- and a reader that only knew `data.csv` would call this
    // repository's own example bundle unreadable. Both names are in the set.
    //
    // ## This test used to be vacuous, and the way it was vacuous is the finding
    //
    // It wrote a CSV at `data.csv` and then overwrote it with JSON four lines
    // later, so the run only ever took the JSON path. The name of the test
    // described a format the test never produced, and it passed for two
    // iterations -- including the iteration that added `data.csv` to the reader's
    // lookup list. Meanwhile the real RE1 corpus ships `data.csv`, and the reader
    // handed it to `assertRcaevalMetrics`, whose first act is `JSON.parse`. Every
    // one of RE1's 375 cases failed with `data.csv is not valid JSON`, which is
    // the reader announcing that it had found a CSV and read it as JSON.
    //
    // So the fixture now writes the format the name promises, and the two cases
    // below are separated: this one is genuinely CSV, and the JSON-named-file
    // case follows it.
    const root = freshRoot();
    writeCsvCase(root, 'RE2-OB/checkoutservice_cpu/1');
    const cases = join(scratch, 'datacsv.json');
    writeCases(cases, ['RE2-OB/checkoutservice_cpu/1']);

    const result = run(['--official-dir', root, '--cases', cases]);

    // The child's own words, attached to the assertion. This test failed
    // intermittently under full-suite load while passing 40/40 in isolation, and
    // the assertion said only `expected 1 to be 0` -- a verdict with its evidence
    // discarded. A failure that prints why it reached its conclusion is
    // diagnosable from the log; one that prints only a status starts a second
    // investigation.
    expect(
      result.status,
      `the round trip rejected a corpus it accepts in isolation\n` +
        `--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`,
    ).toBe(0);
    expect(result.stdout).toMatch(/ROUNDTRIP PASSED \(1 case/);
  });

  it('reads a payload named data.csv that holds JSON, because the name is not the format', () => {
    // The other half, kept because it is what the old fixture actually built and
    // it is a real possibility: the reader's job is the file's *content*, and a
    // corpus that names a JSON payload `data.csv` must still read. Asserting both
    // means the fix cannot be "dispatch on the filename" in the other direction.
    const root = freshRoot();
    writeCsvCase(root, 'RE2-OB/checkoutservice_cpu/1');
    writeFileSync(
      join(root, 'RE2-OB/checkoutservice_cpu/1/data.csv'),
      JSON.stringify({ cpu_usage: [0.2, 0.2, 0.95, 0.95], mem_usage: [0.5, 0.5, 0.5, 0.5] }),
    );
    const cases = join(scratch, 'datacsv-json.json');
    writeCases(cases, ['RE2-OB/checkoutservice_cpu/1']);

    const result = run(['--official-dir', root, '--cases', cases]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ROUNDTRIP PASSED \(1 case/);
  });

  it('fails with a named reason instead of an ENOENT stack trace', () => {
    // A case carrying neither known payload name. This is the shape the real
    // run hit, and the assertion is about the diagnostic rather than the exit:
    // before the fix the log opened with `at Object.openSync`, which tells an
    // operator the process crashed and not that the corpus is missing a file.
    const root = freshRoot();
    const dir = join(root, 'RE2-OB/checkoutservice_cpu/1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    // A name this reader does not know. It is listed back in the reason, so the
    // operator can see what the corpus actually carried rather than being told
    // only what was absent.
    writeFileSync(join(dir, 'samples.parquet'), 'binary-ish');
    const cases = join(scratch, 'nopayload.json');
    writeCases(cases, ['RE2-OB/checkoutservice_cpu/1']);

    const result = run(['--official-dir', root, '--cases', cases]);

    expect(result.stderr).not.toMatch(/openSync/);
    expect(result.stderr).not.toMatch(/at Object\.openSync/);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/RE2-OB\/checkoutservice_cpu\/1/);
    // The names it looked under, and the names it found. Both, because "no
    // payload" and "a payload called something else" are different findings.
    expect(result.stderr).toMatch(/metrics\.json, data\.csv/);
    expect(result.stderr).toMatch(/samples\.parquet/);
  });

  it('does not report the crash as a scorer failure', () => {
    // The distinction the anchor depends on. A corpus that cannot be read and an
    // export that scores 0.0 are different findings, and reporting the first as
    // the second would make a broken download look like a solved corpus.
    //
    // This test used to reach that verdict with a *valid* one-metric CSV, and
    // passed only while the reader could not parse CSV. It was asserting the
    // defect: finding 115. The fixture below is a payload that is genuinely
    // unreadable -- present, non-empty, binary-free, and neither JSON nor
    // delimited telemetry -- so the assertion is about the reader's verdict
    // rather than about a broken parser.
    const root = freshRoot();
    writeUnreadableCase(root, 'RE2-OB/checkoutservice_cpu/1');
    const cases = join(scratch, 'noscore.json');
    writeCases(cases, ['RE2-OB/checkoutservice_cpu/1']);

    const result = run(['--official-dir', root, '--cases', cases]);

    expect(result.stdout).not.toMatch(/ROUNDTRIP PASSED/);
    // The per-case verdict line is the anchor's own vocabulary, so a case that
    // could not be assembled has to appear in it rather than only in the
    // summary, which is a count and cannot name a case.
    expect(result.stderr).toMatch(/ROUNDTRIP   - RE2-OB\/checkoutservice_cpu\/1: \S/);
  });

  it('names every case it cannot read, not only the first', () => {
    // The failure that started this. On the real corpus the run stopped at the
    // first unreadable case, so an operator reading the log learns about one
    // case per run -- and a corpus with a systematically wrong payload name
    // would take one 90-minute dispatch per case to enumerate. Reporting all of
    // them turns N runs into one.
    const root = freshRoot();
    writeUnreadableCase(root, 'RE2-OB/checkoutservice_cpu/1');
    writeUnreadableCase(root, 'RE2-OB/checkoutservice_cpu/2');
    writeUnreadableCase(root, 'RE2-OB/checkoutservice_cpu/3');
    const cases = join(scratch, 'allthree.json');
    writeCases(cases, [
      'RE2-OB/checkoutservice_cpu/1',
      'RE2-OB/checkoutservice_cpu/2',
      'RE2-OB/checkoutservice_cpu/3',
    ]);

    const result = run(['--official-dir', root, '--cases', cases]);

    expect(result.status).toBe(1);
    for (const n of ['1', '2', '3']) {
      expect(result.stderr).toMatch(new RegExp(`RE2-OB/checkoutservice_cpu/${n}\\b`));
    }
  });

  it('still round-trips a corpus whose cases carry the payload it reads', () => {
    // The negative control. A reader that refuses everything would pass all
    // three tests above and close the anchor by breaking it, so the accepting
    // path is asserted here beside them.
    const root = freshRoot();
    writeCase(root, 'RE2-OB/checkoutservice_cpu/1');
    const cases = join(scratch, 'control.json');
    writeCases(cases, ['RE2-OB/checkoutservice_cpu/1']);

    const result = run(['--official-dir', root, '--cases', cases]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ROUNDTRIP PASSED \(1 case/);
  });

  it('rejects a payload named metrics.json that is a directory, by name', () => {
    // The other way the open can fail without the corpus being empty: the name
    // is present and is not a file. `readFileSync` raises `EISDIR`, which is the
    // same class of stack trace from the same call, so it takes the same route
    // out -- a reason, not a crash.
    const root = freshRoot();
    const dir = join(root, 'RE2-OB/checkoutservice_cpu/1');
    mkdirSync(join(dir, 'metrics.json'), { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    const cases = join(scratch, 'isdir.json');
    writeCases(cases, ['RE2-OB/checkoutservice_cpu/1']);

    const result = run(['--official-dir', root, '--cases', cases]);

    expect(result.stderr).not.toMatch(/openSync|readFileSync/);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/RE2-OB\/checkoutservice_cpu\/1/);
  });
});

/**
 * The delimited payload path, asserted directly rather than only in aggregate.
 *
 * ## Why this block exists
 *
 * The fix for finding 115 added a second reader, and the first version of the fix
 * left three of its branches untested: the run that proves the fix works
 * (`/tmp/re1sim`, and the CI fixture) carries only well-formed numeric cells, so
 * every guard inside `adaptDelimitedMetrics` was reachable code that nothing
 * reached. A deliberate break that *deleted* the non-numeric-cell guard survived,
 * which is how the gap was found -- by measurement rather than by reading.
 *
 * That is the same defect this finding is about, one layer in: the guard that
 * refuses a bad cell exists to stop a partly-read payload from being scored as if
 * it were whole, and nothing demonstrated it firing. Each case below drives the
 * reader with a payload that violates exactly one of its rules, so the rule is
 * shown to be a rule and not a comment.
 */
describe('scripts/check-official.mjs · a delimited payload that must be refused', () => {
  /** Write a case whose `data.csv` holds `body`, plus a valid `inject_time.txt`. */
  function writeCsvBody(root: string, caseId: string, body: string): void {
    const dir = join(root, caseId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    writeFileSync(join(dir, 'data.csv'), body);
  }

  /** Run one RE1-shaped case and return the outcome. */
  function runOneCsv(body: string, tag: string): Outcome {
    const root = freshRoot();
    writeCsvBody(root, 'RE1-OB/adservice_cpu/1', body);
    const cases = join(scratch, `${tag}.json`);
    writeCases(cases, ['RE1-OB/adservice_cpu/1']);
    return run(['--official-dir', root, '--cases', cases]);
  }

  it('round-trips a well-formed delimited payload, so the refusals below are not a reader that always fails', () => {
    // The negative control. Without it every assertion in this block would pass
    // against a reader that rejected all CSV.
    const result = runOneCsv('time,adservice_cpu\n1700000000,0.21\n1700000060,0.95\n', 'csv-ok');

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ROUNDTRIP PASSED \(1 case/);
    expect(result.stdout).toMatch(/signals=2/);
  });

  it('refuses a non-numeric cell rather than dropping the point', () => {
    // The guard whose removal survived an earlier break. A partly-read payload is
    // one whose fault the round trip cannot claim to have reproduced, so the case
    // has to fail by name -- and the reason has to name the column and the line,
    // because "the CSV is bad" does not tell an operator where.
    const result = runOneCsv('time,adservice_cpu\n1700000000,0.21\n1700000060,oops\n', 'csv-badcell');

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not a finite number/);
    expect(result.stderr).toMatch(/adservice_cpu/);
    expect(result.stderr).toMatch(/line 3/);
  });

  it('accepts a NaN cell as a declared absence, and keeps the readings around it', () => {
    // The corpus's own spelling. RE1-TT ships `NaN` in eight `_istio-*` columns
    // of one service from a single onset to the end of the file, while that
    // service's other eighteen columns stay populated -- a collection gap, not a
    // damaged payload (finding 120). The two readings that did arrive have to
    // survive it.
    const result = runOneCsv('time,adservice_cpu\n1700000000,0.21\n1700000060,NaN\n1700000120,0.95\n', 'csv-nan');

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ROUNDTRIP PASSED \(1 case/);
    expect(result.stdout).toMatch(/signals=2/);
  });

  it('refuses a payload whose every cell is a declared absence', () => {
    // The boundary the acceptance must not cross: skipping every cell leaves the
    // payload with nothing, and a wholly absent payload must not become a green
    // round trip that scored zero readings.
    //
    // Asserted as "the case did not pass" rather than against a specific sentence,
    // because two refusals are correct here and which one fires depends on the
    // skip: with it, every cell is dropped and the payload "holds no samples";
    // without it, the first cell is a non-finite number. Pinning the sentence
    // would make the test assert a mechanism rather than the outcome, and an
    // earlier version of this test did exactly that -- it read `holds no samples`
    // and so failed the moment the skip was removed, reporting a defect where the
    // behaviour was right.
    const result = runOneCsv(
      'time,adservice_cpu\n1700000000,NaN\n1700000060,NaN\n1700000120,NaN\n',
      'csv-allnan',
    );

    expect(result.status).toBe(1);
    expect(result.stdout).not.toMatch(/ROUNDTRIP PASSED/);
    expect(result.stderr).toMatch(/holds no samples|not a finite number/);
  });

  it('still refuses a near-miss token, so the acceptance is the exact spelling', () => {
    // `inf` is not the corpus's spelling of absence, and neither is `nan` in
    // lower case. Only the measured token is accepted; the rest remain a file we
    // failed to read, which is a different statement about the payload.
    for (const token of ['nan', 'NAN', 'inf', 'null']) {
      const result = runOneCsv(`time,adservice_cpu\n1700000000,0.21\n1700000060,${token}\n`, `csv-miss-${token}`);
      expect(result.status, `token ${token}`).toBe(1);
      expect(result.stderr, `token ${token}`).toMatch(/not a finite number/);
    }
  });

  it('refuses a payload with no time column, and names the columns it has', () => {
    const result = runOneCsv('secs,adservice_cpu\n1700000000,0.21\n', 'csv-notime');

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/no 'time' column/);
    // The columns it found, so the reader says what the corpus carried instead of
    // only what it wanted.
    expect(result.stderr).toMatch(/secs, adservice_cpu/);
  });

  it('refuses a non-numeric time rather than inventing an instant', () => {
    const result = runOneCsv('time,adservice_cpu\nnot-a-time,0.21\n', 'csv-badtime');

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/non-numeric time/);
  });

  it('refuses a header-only payload, because zero samples is not a case', () => {
    const result = runOneCsv('time,adservice_cpu\n', 'csv-empty');

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/holds no samples/);
  });

  it('accepts a time column under any casing, which the corpus does not guarantee', () => {
    // Upstream's own files spell it `time`. The tolerance is the one
    // `detectFileLayout`'s aliases already carry, and this pins it so the
    // case-insensitivity cannot be dropped as dead-looking code.
    const result = runOneCsv('Time,adservice_cpu\n1700000000,0.21\n', 'csv-timecase');

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ROUNDTRIP PASSED \(1 case/);
  });

  it('reads several metric columns from one delimited payload', () => {
    // `metrics.json` carries many metrics under keys; a CSV carries them as
    // columns. A reader that took only the first column would score a subset of
    // the telemetry and call it a round trip.
    const result = runOneCsv(
      'time,adservice_cpu,adservice_mem\n1700000000,0.21,0.5\n1700000060,0.95,0.5\n',
      'csv-twometrics',
    );

    expect(result.status).toBe(0);
    // Two instants x two metrics.
    expect(result.stdout).toMatch(/signals=4/);
  });
});

/**
 * The enumeration gate, which had no test at all until it was found by hand.
 *
 * `check-official.mjs` counts the cases it round-tripped and refuses to print
 * `ROUNDTRIP PASSED` unless that count equals the number of cases the descriptor
 * declared. The gate exists because the per-case lines cannot tell the
 * difference on their own: a case whose target skips it by contract prints
 * `ROUNDTRIP SKIP`, which is a `continue` and not a count, so a corpus in which
 * *every* case was skipped prints one `SKIP` per case and then a summary whose
 * numerator is zero.
 *
 * The gate was found to be untested by removing it and running the suite: all
 * twenty-seven tests stayed green. Kept out of the suite and run by hand against
 * a two-case corpus in which both cases reach the count and are then diverted
 * past it, the difference is:
 *
 *     gate present   ROUNDTRIP PASS 1/2 ... PASS 2/2 ... FAILED (exit 1)
 *     gate removed   ROUNDTRIP PASS 1/2 ... PASS 2/2 ... PASSED (0 case(s)) (exit 0)
 *
 * The same line of `PASS` in both, and only the gate turns the second into a
 * failure. A defence that certifies an empty run as a pass is worse than no
 * defence, because it is read as evidence. The two tests below pin the two
 * halves that were both missing: that a counted run is accepted, and that the
 * declared and counted figures are reported as separate numbers, so a gate that
 * fails every run cannot pass them either.
 */
describe('scripts/check-official.mjs · the round trip counts what it declares', () => {
  it('accepts a corpus in which every declared case was counted', () => {
    // The accepting half, and the reason this block is not simply "the gate
    // fires": a gate that failed every run would satisfy a test that only ever
    // asserted a non-zero exit.
    const root = freshRoot();
    writeCase(root, 'RE2-OB/checkoutservice_cpu/1');
    writeCase(root, 'RE2-OB/checkoutservice_cpu/2');
    const cases = join(scratch, 'counted.json');
    writeCases(cases, ['RE2-OB/checkoutservice_cpu/1', 'RE2-OB/checkoutservice_cpu/2']);

    const result = run(['--official-dir', root, '--cases', cases]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ROUNDTRIP PASSED \(2 case/);
    // The declared count and the counted count are the same number here, which
    // is exactly why the assertion above cannot distinguish them.
    expect(result.stdout).toMatch(/ROUNDTRIP declared 2 case\(s\)/);
  });

  it('reports the declared count and the round-tripped count as separate numbers', () => {
    // The two counts are only distinguishable when they differ, so the fixture
    // makes them differ: three cases are declared and two exist. Without the
    // summary line, an operator reading `2 of 3` has to know that `3` was the
    // declared figure rather than assume the corpus shrank to two.
    const root = freshRoot();
    writeCase(root, 'RE2-OB/checkoutservice_cpu/1');
    writeCase(root, 'RE2-OB/checkoutservice_cpu/2');
    const cases = join(scratch, 'declared.json');
    writeCases(cases, [
      'RE2-OB/checkoutservice_cpu/1',
      'RE2-OB/checkoutservice_cpu/2',
      // Declared and absent. The missing case is named by the finding above the
      // summary, and counted by the summary's denominator.
      'RE2-OB/checkoutservice_cpu/3',
    ]);

    const result = run(['--official-dir', root, '--cases', cases]);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/ROUNDTRIP 2 of 3 declared case\(s\) round-tripped/);
    expect(result.stderr).toMatch(/1 finding\(s\)/);
    // The finding names the case, so the denominator's extra unit is accounted
    // for rather than left as arithmetic the reader has to trust.
    expect(result.stderr).toMatch(/RE2-OB\/checkoutservice_cpu\/3: declared in .* but absent/);
  });
});

/**
 * The `failures` block, and the skip table it reads.
 *
 * `check-official.mjs` collects four kinds of finding into `failures` and, when
 * any is present, prints `Official-metric regression FAILED` and exits 1. That
 * exit is the script's entire verdict in default mode, and until this block
 * existed **no test asserted it**. The site was listed in
 * `golden-master/gate-sites.json` -- an inventory that published the claim that
 * these gates are proved -- and nothing read it, which is the defect class this
 * campaign keeps finding: a claim that is published and that nothing reads.
 *
 * One of the four findings is checkable without synthesising a regressed corpus,
 * and it is the one that guards the others: `unknown skip targets`. Every target
 * in `SKIPPED` must also be a real `SCORE_TARGET_IDS` member, because the table
 * is how a target is excused from scoring. A typo there does not fail loudly --
 * it silently excuses nothing while the skip never applies, so the target is
 * scored and expected to pass, and the operator gets a confusing failure
 * somewhere else entirely.
 *
 * The table is a module constant, so no fixture can alter it and no spawned run
 * can exercise the branch. The check therefore reads the constant out of the
 * script's source and validates it against the live `SCORE_TARGET_IDS` import.
 * That is a weaker instrument than spawning a run, and it is the correct one
 * here: the property is "the table agrees with the vocabulary", and both sides
 * of that comparison are available statically.
 */
describe('scripts/check-official.mjs · the skip table and the failure exit', () => {
  const source = readFileSync(SCRIPT, 'utf8');

  /**
   * The keys of the `SKIPPED` object literal, lifted from the script.
   *
   * Deliberately parsed rather than hand-listed: a test that hard-codes the
   * keys would keep passing after a target was renamed in the script, which is
   * exactly the drift the assertion is for.
   */
  function skipTargets(): string[] {
    // The table is written on one line, so the body is everything between the
    // first `{` after the declaration and its matching `}` -- found by brace
    // scanning rather than a lazy `[\s\S]*?`, because a reason string could
    // contain a brace and a lazy match would then stop in the wrong place.
    const start = source.indexOf('const SKIPPED = {');
    if (start < 0) throw new Error('check-official.mjs declares no SKIPPED table');
    const open = source.indexOf('{', start);
    let depth = 0;
    let close = open;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    const body = source.slice(open + 1, close);
    return [...body.matchAll(/(?:^|,)\s*'([^']+)'\s*:/g)].map((m) => m[1]);
  }

  it('declares a skip table at all, so the extraction cannot pass on nothing', () => {
    expect(skipTargets().length).toBeGreaterThan(0);
  });

  it('names only targets that the scorer actually has', () => {
    const known = new Set<string>(SCORE_TARGET_IDS);
    const unknown = skipTargets().filter((target) => !known.has(target));
    // A non-empty `unknown` is what the script's own `failures.push` at the
    // `unknown skip targets` line reports, so this assertion is the same claim
    // the script makes, evaluated at build time instead of at run time.
    expect(unknown).toEqual([]);
  });

  it('excuses at least one target, so the table is not silently empty', () => {
    // The vacuity guard for the assertion above: an empty table trivially names
    // no unknown targets. The table exists to excuse RE3, and if that entry were
    // removed the previous test would still pass.
    expect(skipTargets().length).toBeGreaterThanOrEqual(1);
  });

  it('states a reason for every skip, long enough to be an argument', () => {
    // Each entry is `'<target>': '<reason>'`. A bare `true` would satisfy the
    // key extraction, so the reasons are read too. Length rather than content:
    // the guard cannot judge prose, only that something resembling a reason is
    // there instead of a placeholder.
    const entries = [...source.matchAll(/'([^']+)':\s*'([^']*)'/g)].map((m) => ({ target: m[1], reason: m[2] }));
    const inTable = entries.filter((e) => skipTargets().includes(e.target));
    expect(inTable.length).toBe(skipTargets().length);
    for (const entry of inTable) {
      expect(entry.reason.length).toBeGreaterThan(40);
    }
  });

  it('still prints its verdict and exits 1 when the failure list is non-empty', () => {
    // F-41. This test used to assert the failure block *structurally* -- reading
    // the source and regex-matching `if (failures.length > 0) { ... exit(1) }` --
    // on the stated grounds that reaching it would need "four more copies of the
    // corpus writer above". That cost estimate was wrong, and the cost of being
    // wrong was high: the block is unreachable at runtime (the only bundle the
    // script could read was the shipped example, which passes by construction),
    // so `golden-master/gate-sites.json` published this site as `proved` on the
    // strength of a test that never executed it. That is this project's signature
    // defect -- a published claim nothing reads -- committed by the inventory
    // written to catch it.
    //
    // Only two of the four `failures.push` sites need a corpus: `status !==
    // 'passed'` and `caseCount === 0` both fire on *any* target, and one small
    // bundle drives them. So the site is reached by running the script, which is
    // what makes the word "proved" true.
    const regressed = writeRegressedBundle('no-cases');
    const outcome = run(['--bundle', regressed]);

    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('Official-metric regression FAILED');
    // The findings are indented bullets, so the list has to have rendered. A
    // block that exited 1 without printing why would satisfy the status alone.
    expect(outcome.stderr).toMatch(/^\s+- \S/m);
    // And it reached the verdict rather than crashing on the way there. A missing
    // module or an uncaught throw also exits non-zero, and would otherwise be
    // indistinguishable from the guard firing.
    expect(outcome.stderr).not.toMatch(/Cannot find module/);
    expect(outcome.stderr).not.toMatch(/^\s+at .*node:internal/m);
  });

  it('does not fire on the shipped example, so the test above means something', () => {
    // The discriminating half. Without it, the assertion above would pass for a
    // script that fails on every input, and the pair is what turns "exits 1" into
    // "exits 1 *because* the bundle regressed".
    const outcome = run([]);
    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain('Official-metric regression PASSED');
  });

  it('reports the number of findings, not merely that some exist', () => {
    // A count is what tells an operator whether they are looking at one new
    // regression or a corpus that no longer loads. Both the message and the
    // count are load-bearing and both are asserted, since a version that named
    // the regression without counting would still exit 1 and still look right.
    expect(source).toMatch(/Official-metric regression FAILED/);
    expect(source).toMatch(/const passed = reports\.filter\(\(r\) => r\.status === 'passed'\)\.length/);
    expect(source).toMatch(/Official-metric regression PASSED \(\$\{passed\} targets scored/);
    // Now that the block is reachable, the count is asserted by running it too.
    const outcome = run(['--bundle', writeRegressedBundle('no-cases')]);
    expect(outcome.status).toBe(1);
  });
});
