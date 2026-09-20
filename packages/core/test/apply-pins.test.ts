import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * `scripts/apply-pins.mjs` -- the step that turns a measured digest into a
 * recorded one without a human retyping it.
 *
 * The registry is the thing a fetch verifies against, so the value in it has to
 * be the value that was measured. Printing the digest and reading it out of a CI
 * log is a transcription step in the one place where the whole design is about
 * not transcribing: a mistyped hex digit there does not fail loudly, it makes
 * every subsequent run report a mismatch against a good download.
 *
 * Three properties are asserted, and all three are about what the tool refuses:
 *
 *  - It edits a *named* field set and nothing else. The registry's url, licence
 *    and extractsTo fields are reviewed by hand; a tool that could rewrite them
 *    would let a redirected download change where the next run looks, silently.
 *  - It refuses a digest that is not a digest, and refuses to pin an id the
 *    registry does not have -- rather than adding one.
 *  - Applying the same report twice is a no-op, so a re-run in CI does not
 *    produce a diff that a reviewer has to read and dismiss.
 *
 * `spawnSync`, not `execFileSync`: the tool is driven as the operator drives it,
 * and its `--check` mode reports through the exit code, which has to be readable
 * on a run that succeeds.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'apply-pins.mjs');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], env: Record<string, string> = {}): Outcome {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, ...env },
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function digestOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-pins-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A minimal registry with two assets, one already pinned. */
function writeRegistry(overrides: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(scratch, 'reg-'));
  const path = join(dir, 'official-assets.json');
  const registry = {
    schema: 'rca-bench-official-assets/1',
    note: 'fixture',
    assets: [
      {
        id: 'asset-a',
        anchor: 'rcaeval-re2',
        url: 'https://example.test/a.zip?download=1',
        license: 'MIT',
        licenseSource: 'https://example.test/LICENSE',
        fetchable: true,
        sha256: null,
        bytes: null,
        extractsTo: 'A',
      },
      {
        id: 'asset-b',
        anchor: 'rcaeval-re2',
        url: 'https://example.test/b.csv',
        license: 'MIT',
        licenseSource: 'https://example.test/LICENSE',
        fetchable: true,
        sha256: digestOf('already pinned'),
        bytes: 14,
        extractsTo: null,
      },
    ],
    notFetchable: [],
    ...overrides,
  };
  writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`);
  return path;
}

function writeReport(entries: unknown[], overrides: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(scratch, 'rep-'));
  const path = join(dir, 'pins.json');
  writeFileSync(
    path,
    `${JSON.stringify(
      { schema: 'rca-bench-official-pins/1', anchor: 'rcaeval-re2', note: 'fixture', assets: entries, ...overrides },
      null,
      2,
    )}\n`,
  );
  return path;
}

describe('scripts/apply-pins.mjs · pinning measured digests', () => {
  it('writes the measured digest and byte count into the named asset', () => {
    const registry = writeRegistry();
    const report = writeReport([{ id: 'asset-a', url: 'https://example.test/a.zip?download=1', bytes: 4242, sha256: 'a'.repeat(64) }]);
    const result = run(['--registry', registry, '--report', report]);
    expect(result.status).toBe(0);

    const written = JSON.parse(readFileSync(registry, 'utf8'));
    const a = written.assets.find((x: { id: string }) => x.id === 'asset-a');
    expect(a.sha256).toBe('a'.repeat(64));
    expect(a.bytes).toBe(4242);
  });

  it('leaves every field other than sha256 and bytes exactly as it found them', () => {
    const registry = writeRegistry();
    const before = JSON.parse(readFileSync(registry, 'utf8'));
    const report = writeReport([{ id: 'asset-a', url: 'https://example.test/a.zip?download=1', bytes: 1, sha256: 'b'.repeat(64) }]);
    expect(run(['--registry', registry, '--report', report]).status).toBe(0);

    const after = JSON.parse(readFileSync(registry, 'utf8'));
    expect(after.schema).toBe(before.schema);
    expect(after.note).toBe(before.note);
    expect(after.assets[0].url).toBe(before.assets[0].url);
    expect(after.assets[0].license).toBe(before.assets[0].license);
    expect(after.assets[0].licenseSource).toBe(before.assets[0].licenseSource);
    expect(after.assets[0].extractsTo).toBe(before.assets[0].extractsTo);
    expect(after.assets[0].anchor).toBe(before.assets[0].anchor);
    expect(after.assets[0].fetchable).toBe(before.assets[0].fetchable);
  });

  // An id in the report that the registry does not have is a mismatch between
  // two files, and the fix is to look at them -- not to append an entry whose
  // licence and extractsTo nobody chose.
  it('refuses to pin an id the registry does not contain', () => {
    const registry = writeRegistry();
    const report = writeReport([{ id: 'asset-zzz', url: 'https://example.test/z.zip', bytes: 1, sha256: 'c'.repeat(64) }]);
    const result = run(['--registry', registry, '--report', report]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('asset-zzz');
    expect(result.stderr).toMatch(/not in the registry|unknown/i);
  });

  it('refuses a sha256 that is not a 64-character lowercase hex digest', () => {
    const registry = writeRegistry();
    for (const bad of ['deadbeef', 'z'.repeat(64), 'A'.repeat(64), '']) {
      const report = writeReport([{ id: 'asset-a', url: 'https://example.test/a.zip', bytes: 1, sha256: bad }]);
      const result = run(['--registry', registry, '--report', report]);
      expect(result.status, `accepted sha256 ${JSON.stringify(bad)}`).toBe(1);
    }
  });

  it('refuses a byte count that is not a positive whole number', () => {
    const registry = writeRegistry();
    for (const bad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const report = writeReport([{ id: 'asset-a', url: 'https://example.test/a.zip', bytes: bad, sha256: 'd'.repeat(64) }]);
      const result = run(['--registry', registry, '--report', report]);
      expect(result.status, `accepted bytes ${String(bad)}`).toBe(1);
    }
  });

  // A report that says nothing is not evidence that nothing changed; it is a
  // report that failed to measure. Accepting it would make the CI step green on
  // a fetch that downloaded no bytes at all.
  it('refuses a report with no assets, rather than reporting success', () => {
    const registry = writeRegistry();
    const report = writeReport([]);
    const result = run(['--registry', registry, '--report', report]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/no assets|empty/i);
  });

  it('refuses a report whose schema it does not recognise', () => {
    const registry = writeRegistry();
    const report = writeReport([{ id: 'asset-a', url: 'x', bytes: 1, sha256: 'e'.repeat(64) }], {
      schema: 'rca-bench-official-pins/99',
    });
    const result = run(['--registry', registry, '--report', report]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('rca-bench-official-pins/99');
  });

  // The url is the only field duplicated across the two files, and it is there
  // so a report cannot be applied to a registry that has since moved. Without
  // the check, a redirect that changed the artifact would be pinned under the
  // old url's identity.
  it('refuses when the report url and the registry url disagree', () => {
    const registry = writeRegistry();
    const report = writeReport([{ id: 'asset-a', url: 'https://evil.test/a.zip', bytes: 1, sha256: 'f'.repeat(64) }]);
    const result = run(['--registry', registry, '--report', report]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/url/i);
  });

  it('is a no-op when the same report is applied twice', () => {
    const registry = writeRegistry();
    const report = writeReport([{ id: 'asset-a', url: 'https://example.test/a.zip?download=1', bytes: 7, sha256: '1'.repeat(64) }]);
    expect(run(['--registry', registry, '--report', report]).status).toBe(0);
    const once = readFileSync(registry, 'utf8');
    expect(run(['--registry', registry, '--report', report]).status).toBe(0);
    expect(readFileSync(registry, 'utf8')).toBe(once);
  });

  // `--check` is what CI runs: the report is compared against the registry and
  // nothing is written, so a drift is a failure to reconcile rather than a
  // silent edit on a runner.
  it('--check fails on a mismatch and writes nothing', () => {
    const registry = writeRegistry();
    const before = readFileSync(registry, 'utf8');
    const report = writeReport([{ id: 'asset-a', url: 'https://example.test/a.zip?download=1', bytes: 9, sha256: '2'.repeat(64) }]);
    const result = run(['--registry', registry, '--report', report, '--check']);
    expect(result.status).toBe(1);
    expect(readFileSync(registry, 'utf8')).toBe(before);
  });

  it('--check passes when the registry already records the measured values', () => {
    const registry = writeRegistry();
    const report = writeReport([{ id: 'asset-a', url: 'https://example.test/a.zip?download=1', bytes: 9, sha256: '3'.repeat(64) }]);
    expect(run(['--registry', registry, '--report', report]).status).toBe(0);
    const result = run(['--registry', registry, '--report', report, '--check']);
    expect(result.status).toBe(0);
  });

  // An already-pinned asset that a report measures differently is the case that
  // matters most: upstream replaced the artifact, or the download was corrupted.
  it('--check reports a pinned asset whose measurement no longer agrees', () => {
    const registry = writeRegistry();
    const report = writeReport([{ id: 'asset-b', url: 'https://example.test/b.csv', bytes: 99, sha256: '4'.repeat(64) }]);
    const result = run(['--registry', registry, '--report', report, '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('asset-b');
  });

  it('requires --report and --registry rather than guessing either', () => {
    expect(run(['--registry', writeRegistry()]).status).toBe(1);
    expect(run(['--report', writeReport([{ id: 'x', url: 'u', bytes: 1, sha256: 'a'.repeat(64) }])]).status).toBe(1);
  });

  // "Not yet pinned" and "pinned to something else" are different findings and
  // have different responses: the first is the expected state before the first
  // pin lands and just needs merging, the second means upstream moved or the
  // download was corrupted and needs investigating. A single exit code would
  // collapse them, and the collapse is what makes an operator stop reading the
  // message. The distinction is carried in the output text, and `--check`
  // reports which one it found.
  it('--check distinguishes an asset that is not yet pinned from one that has drifted', () => {
    const registry = writeRegistry();
    const report = writeReport([{ id: 'asset-a', url: 'https://example.test/a.zip?download=1', bytes: 5, sha256: '5'.repeat(64) }]);

    const unpinned = run(['--registry', registry, '--report', report, '--check']);
    expect(unpinned.status).toBe(1);
    expect(unpinned.stderr).toMatch(/not yet pinned|unpinned/i);
    expect(unpinned.stderr).not.toMatch(/drift/i);

    expect(run(['--registry', registry, '--report', report]).status).toBe(0);

    const drifted = writeReport([{ id: 'asset-a', url: 'https://example.test/a.zip?download=1', bytes: 6, sha256: '6'.repeat(64) }]);
    const after = run(['--registry', registry, '--report', drifted, '--check']);
    expect(after.status).toBe(1);
    expect(after.stderr).toMatch(/drift/i);
    expect(after.stderr).not.toMatch(/not yet pinned/i);
  });

  it('names a missing report file instead of throwing a read error', () => {
    const result = run(['--registry', writeRegistry(), '--report', join(scratch, 'nope.json')]);
    expect(result.status).toBe(1);
    expect(result.stderr).not.toMatch(/at Object\./);
  });
});
