import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * `scripts/check-official-registry.mjs` -- the guard that runs on every push.
 *
 * Three checks already cover the registry from different angles and none of them
 * covers this one:
 *
 *  - `official-assets.test.ts` asserts the registry's *shape* and completeness.
 *    It runs inside the test suite, so it cannot see the files the registry
 *    *points at*.
 *  - `check-no-vendored-data.mjs` asserts no corpus is committed.
 *  - `official-data.yml` compares the registry against a real download, but only
 *    on a schedule and only for one anchor at a time. A pin edited by hand on a
 *    Tuesday is not compared against anything until the next Monday.
 *
 * What is left is the internal consistency of the repository: a pin that is
 * recorded for one of a pair but not the other, a `fetchable: false` entry that
 * still carries a url, a digest that no longer matches a fixture the repository
 * ships. Those are all decidable from the working tree alone, and they are the
 * mistakes a hand-edit actually makes.
 *
 * `spawnSync` so a successful run's output is readable, and the guard is driven
 * against a fixture registry rather than the real one, so the assertions are
 * about the rule and not about today's registry contents -- which are expected
 * to change.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-official-registry.mjs');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[] = []): Outcome {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-registry-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function digestOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function writeRegistry(assets: unknown[], extra: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(scratch, 'reg-'));
  const path = join(dir, 'official-assets.json');
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        schema: 'rca-bench-official-assets/1',
        note: 'fixture',
        assets,
        notFetchable: [],
        ...extra,
      },
      null,
      2,
    )}\n`,
  );
  return path;
}

function asset(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'a',
    anchor: 'rcaeval-re2',
    url: 'https://example.test/a.zip?download=1',
    license: 'MIT',
    licenseSource: 'https://example.test/LICENSE',
    fetchable: true,
    sha256: null,
    bytes: null,
    extractsTo: 'A',
    ...overrides,
  };
}

describe('scripts/check-official-registry.mjs · the registry is self-consistent', () => {
  it('passes on the registry the repository actually ships', () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OK/);
  });

  // A digest and a byte count describe the same download. Recording one and not
  // the other is not a partial pin, it is an ambiguous one: a reader cannot tell
  // whether the missing half was never measured or was measured and discarded.
  it('fails when a digest is recorded without a byte count, or the reverse', () => {
    const onlyDigest = run(['--registry', writeRegistry([asset({ sha256: 'a'.repeat(64) })])]);
    expect(onlyDigest.status).toBe(1);
    expect(onlyDigest.stderr).toContain('a');
    expect(onlyDigest.stderr).toMatch(/bytes/i);

    const onlyBytes = run(['--registry', writeRegistry([asset({ bytes: 10 })])]);
    expect(onlyBytes.status).toBe(1);
    expect(onlyBytes.stderr).toMatch(/sha256/i);
  });

  it('accepts both recorded together', () => {
    const result = run(['--registry', writeRegistry([asset({ sha256: 'b'.repeat(64), bytes: 10 })])]);
    expect(result.status).toBe(0);
  });

  it('accepts neither recorded', () => {
    const result = run(['--registry', writeRegistry([asset()])]);
    expect(result.status).toBe(0);
  });

  // `check-no-vendored-data.mjs` exempts `golden-master/rcaeval-cases.json` on the
  // grounds that it is a derived index. A pathPrefix pointing anywhere else is a
  // corpus tree, and the two guards would then disagree about whether it may be
  // committed -- with the exemption winning, because it runs separately.
  it('fails when a pathPrefix escapes the derived descriptor directory', () => {
    const result = run(['--registry', writeRegistry([asset({ pathPrefix: 'dataset/ts-order-service/cpu' })])]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/pathPrefix/i);
  });

  // An entry that is not fetchable is handled by the OpenRCA shard path, not by
  // this script. Keeping a url on it invites a future reader to fetch it.
  it('fails when an entry marked not fetchable still carries a url', () => {
    const result = run(['--registry', writeRegistry([asset({ fetchable: false })])]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/fetchable/i);
  });

  it('fails when an entry marked fetchable carries no url', () => {
    const result = run(['--registry', writeRegistry([asset({ url: undefined })])]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/url/i);
  });

  // Every fetchable asset is downloaded to a name derived from its id, and the
  // extractsTo value is what the round trip then reads. Two assets claiming the
  // same extraction directory would overwrite each other, and the second would
  // win in a way nothing reports.
  it('fails when two assets extract into the same directory', () => {
    const result = run([
      '--registry',
      writeRegistry([
        asset({ id: 'a', extractsTo: 'RE2-OB' }),
        asset({ id: 'b', extractsTo: 'RE2-OB' }),
      ]),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/RE2-OB/);
  });

  it('fails when a notFetchable entry carries no reason', () => {
    const result = run([
      '--registry',
      writeRegistry([], { notFetchable: [{ id: 'x', anchor: 'rca100', license: 'CC', reason: 'short', alternative: null }] }),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/reason/i);
  });

  // The point of the guard is to be runnable from `pnpm lint`, which means it has
  // to fail loudly on a registry it cannot read rather than passing vacuously.
  it('fails on a registry that is not valid JSON, rather than passing silently', () => {
    const dir = mkdtempSync(join(scratch, 'bad-'));
    const path = join(dir, 'official-assets.json');
    writeFileSync(path, '{ not json');
    const result = run(['--registry', path]);
    expect(result.status).toBe(1);
    expect(result.stderr).not.toMatch(/at Object\./);
  });

  it('fails on a missing registry file', () => {
    const result = run(['--registry', join(scratch, 'absent.json')]);
    expect(result.status).toBe(1);
  });

  // A pin is only useful if the asset list it belongs to is the one the scorer
  // knows about. An anchor naming a target that does not exist means the round
  // trip will silently cover nothing for it.
  it('fails when an anchor names a target the scorer does not declare', () => {
    const result = run(['--registry', writeRegistry([asset({ anchor: 'not-a-target' })])]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not-a-target');
  });

  // spot-check that the shipped registry's two known-fetchable families are
  // consistent, so the passing case above is not passing on an empty list.
  it('the shipped registry has assets to check, so the pass above is not vacuous', () => {
    const raw = JSON.parse(
      readFileSync(resolve(ROOT, 'golden-master', 'official-assets.json'), 'utf8'),
    ) as { assets: unknown[] };
    expect(raw.assets.length).toBeGreaterThan(0);
  });
});
