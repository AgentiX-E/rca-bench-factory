import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { SCORE_TARGET_IDS } from '../src/score/score.js';

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
  });

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
  /** A case directory with an `inject_time.txt` and a payload named `data.csv`. */
  function writeCaseWithoutMetrics(root: string, caseId: string): void {
    const dir = join(root, caseId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'inject_time.txt'), '1700000000\n');
    // The payload the corpus actually carries, under the name upstream uses.
    // `main.py` finds its cases by globbing a data.csv pattern, so a reader that
    // only knew `metrics.json` would report a good corpus as unreadable.
    writeFileSync(join(dir, 'data.csv'), 'time,cpu_usage\n0,0.2\n1,0.95\n');
  }

  it('reads a payload the corpus named data.csv, which is what upstream writes', () => {
    // The accepting half of the same fact. `main.py` globs `**\/data.csv`, so a
    // reader that only knew `metrics.json` would call a perfectly good corpus
    // unreadable -- and a reader that only knew `data.csv` would call this
    // repository's own example bundle unreadable. Both names are in the set.
    const root = freshRoot();
    writeCaseWithoutMetrics(root, 'RE2-OB/checkoutservice_cpu/1');
    writeFileSync(
      join(root, 'RE2-OB/checkoutservice_cpu/1/data.csv'),
      JSON.stringify({ cpu_usage: [0.2, 0.2, 0.95, 0.95], mem_usage: [0.5, 0.5, 0.5, 0.5] }),
    );
    const cases = join(scratch, 'datacsv.json');
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
    const root = freshRoot();
    writeCaseWithoutMetrics(root, 'RE2-OB/checkoutservice_cpu/1');
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
    writeCaseWithoutMetrics(root, 'RE2-OB/checkoutservice_cpu/1');
    writeCaseWithoutMetrics(root, 'RE2-OB/checkoutservice_cpu/2');
    writeCaseWithoutMetrics(root, 'RE2-OB/checkoutservice_cpu/3');
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
