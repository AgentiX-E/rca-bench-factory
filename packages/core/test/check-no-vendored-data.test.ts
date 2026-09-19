import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * `scripts/check-no-vendored-data.mjs` must fail when corpus data is committed.
 *
 * A check that passes on the repository as it stands has demonstrated nothing
 * about whether it would notice the thing it is for, and this is the check whose
 * whole job is to notice. Every test below therefore builds a *repository that
 * has the defect* and requires the check to fail on it.
 *
 * Each case is run in a throwaway `git init`, so the check reads a controlled
 * `git ls-files` and nothing here can touch the real index. The corpus is
 * synthesised: a few bytes of plausible telemetry, not a real slice.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-no-vendored-data.mjs');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-vendored-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * Build a throwaway repository whose *tracked* files are exactly `files`.
 *
 * The `git add` is load-bearing and was missing from the first version of this
 * fixture: without it `git ls-files` is empty, the check sees nothing, and every
 * "catches X" test passes for the wrong reason -- it passes because the check
 * found no files at all. The staging is explicit rather than `git add -A` so a
 * test can write an untracked file and have it stay untracked.
 */
function repo(files: Record<string, string | Buffer>): string {
  counter += 1;
  const dir = join(scratch, `repo-${counter}`);
  mkdirSync(dir, { recursive: true });
  spawnSync('git', ['init', '--quiet'], { cwd: dir });
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  if (Object.keys(files).length > 0) {
    spawnSync('git', ['add', '--', ...Object.keys(files)], { cwd: dir });
  }
  return dir;
}

/** Run the check against a repository directory, with `git ls-files` rooted there. */
function run(cwd: string): Outcome {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** The registry, minimal but with the exact shape the check validates. */
function registry(entries: Array<Record<string, unknown>> = []): string {
  return JSON.stringify({ schema: 'rca-bench-official-assets/1', assets: entries, notFetchable: [] }, null, 2);
}

describe('scripts/check-no-vendored-data.mjs · the repository as it stands', () => {
  it('passes, and reports how much it looked at', () => {
    const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: ROOT });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/check-no-vendored-data: OK \(\d+ tracked file/);
  });
});

describe('scripts/check-no-vendored-data.mjs · what it catches', () => {
  it('catches an extracted corpus tree', () => {
    // The whole failure: someone extracted the archive inside the working tree.
    const dir = repo({
      'golden-master/official-assets.json': registry(),
      'RE2-OB/RE2-ob-cpu_1/metrics.json': '{"cpu_usage":[0.2,0.9]}',
    });
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('RE2-OB/RE2-ob-cpu_1/metrics.json');
    expect(result.stderr).toMatch(/inside the upstream corpus directory 'RE2-OB'/);
  });

  it('catches a corpus directory nested somewhere unexpected', () => {
    // Not caught by pattern-matching the repository root, which is why the check
    // looks at every path segment.
    const dir = repo({
      'golden-master/official-assets.json': registry(),
      'packages/core/test/fixtures/RE3-TT/RE3-ts-order-service-code_1/inject_time.txt': '1700000000\n',
    });
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('RE3-TT');
  });

  it('catches a trimmed telemetry slice left behind as a test fixture', () => {
    // The likelier accident than a whole tree: one file carved out of a corpus
    // and committed under a name that does not mention it. Nothing in the path
    // says "corpus", so only the size rule can see it.
    const rows = ['timestamp,service,metric,value'];
    for (let i = 0; i < 40_000; i += 1) {
      rows.push(`2024-07-01T00:${String(i % 60).padStart(2, '0')}:00Z,ts-order-service,cpu_usage,0.${i % 100}`);
    }
    const dir = repo({
      'golden-master/official-assets.json': registry(),
      'tmp-sample.csv': rows.join('\n'),
    });
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('tmp-sample.csv');
    expect(result.stderr).toMatch(/MiB of telemetry-shaped data/);
  });

  it('catches a committed archive of the corpus', () => {
    const dir = repo({
      'golden-master/official-assets.json': registry(),
      'corpus/RE1-OB.zip': Buffer.alloc(2 * 1024 * 1024, 0x41),
    });
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('RE1-OB.zip');
  });

  it('catches a registry entry carrying a field that could hold samples', () => {
    // The registry is metadata about the data. A `samples` or `values` field is
    // where a well-meaning contributor would put the measurements they took,
    // and that is the data entering git by a door nobody is watching.
    const dir = repo({
      'golden-master/official-assets.json': JSON.stringify({
        schema: 'rca-bench-official-assets/1',
        assets: [{ id: 'rcaeval-re2-tt', anchor: 'rcaeval-re2', samples: [1, 2, 3] }],
        notFetchable: [],
      }),
    });
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown field');
    expect(result.stderr).toContain('samples');
  });

  it('catches a registry that cannot be read', () => {
    const dir = repo({ 'golden-master/official-assets.json': '{ not json' });
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('could not be read');
  });
});

describe('scripts/check-no-vendored-data.mjs · what it must not flag', () => {
  it('allows the registry itself, which is about the data rather than the data', () => {
    const dir = repo({
      'golden-master/official-assets.json': registry([
        {
          id: 'rcaeval-re2-tt',
          anchor: 'rcaeval-re2',
          url: 'https://zenodo.org/records/14590730/files/RE2-TT.zip?download=1',
          license: 'MIT',
          licenseSource: 'https://github.com/phamquiluan/RCAEval/blob/main/LICENSE',
          fetchable: true,
          sha256: null,
          bytes: null,
          extractsTo: 'RE2-TT',
        },
      ]),
    });
    const result = run(dir);
    expect(result.status).toBe(0);
  });

  it('allows a small telemetry-shaped fixture', () => {
    // The example bundle and the round-trip fixtures are ours and are tiny. A
    // size rule that rejected them would be turned off rather than fixed.
    const dir = repo({
      'golden-master/official-assets.json': registry(),
      'examples/order-prod/record.csv': 'case_id,prediction\norder-prod-1,"{}"\n',
      'golden-master/fixture.json': JSON.stringify({ cases: 1 }),
    });
    const result = run(dir);
    expect(result.status).toBe(0);
  });

  it('ignores an untracked corpus tree, which is the point of fetching outside', () => {
    // A fetch destination inside the tree is refused by `fetch-official.mjs`.
    // This is the second half of that arrangement: even if one appeared, an
    // untracked tree is not committed and so is not a redistribution.
    const dir = repo({ 'golden-master/official-assets.json': registry() });
    mkdirSync(join(dir, 'RE1-OB', 'RE1-ob-cpu_1'), { recursive: true });
    writeFileSync(join(dir, 'RE1-OB', 'RE1-ob-cpu_1', 'metrics.json'), '{"cpu_usage":[1]}');
    const result = run(dir);
    expect(result.status).toBe(0);
  });

  it('allows a directory whose name merely resembles a corpus name', () => {
    // A prefix match would call `RE2-OB-notes` a corpus tree and the check would
    // then be about spelling. Only the whole segment counts.
    const dir = repo({
      'golden-master/official-assets.json': registry(),
      'docs/RE2-OB-notes.md': '# Notes on the RE2 OB slice\n',
    });
    const result = run(dir);
    expect(result.status).toBe(0);
  });
});
