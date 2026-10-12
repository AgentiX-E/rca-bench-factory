import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach, and reports a disagreement in
 * either direction. It is needed because the derive script is driven through a
 * table of arguments rather than named in each spawn.
 */
const DRIVES = ['scripts/check-backend-support.mjs', 'scripts/derive-backend-support.mjs'];

/**
 * `scripts/check-backend-support.mjs` and `scripts/derive-backend-support.mjs`.
 *
 * The gate holds `docs/architecture.md`'s T2 backend matrix to
 * `golden-master/backend-support.json`; the derive script holds that snapshot to
 * the registry in `packages/core/src/ingest/backends.ts`. Between them a row
 * cannot say "supported" about code that does not pull, and cannot keep saying
 * anything after the code has moved on.
 *
 * Every branch below is reachable only because both scripts take their paths as
 * arguments. A guard whose subject and expectation are both fixed to the shipped
 * files can only ever be observed passing, which is the defect
 * `check-no-absolute-paths.mjs` turned out to have (finding 121's round: "the one
 * gate in the lint chain with no dedicated test, because it scanned the checked-
 * out tree and that tree is clean, so the only reachable result was green").
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CHECK = resolve(ROOT, 'scripts', 'check-backend-support.mjs');
const DERIVE = resolve(ROOT, 'scripts', 'derive-backend-support.mjs');
const SNAPSHOT = resolve(ROOT, 'golden-master', 'backend-support.json');

const dirs: string[] = [];

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'backend-support-'));
  dirs.push(dir);
  return dir;
}

const PULLED = 'HTTP JSON API: GET /api/v1/query_range, read as a matrix';
const REASON =
  'Jaeger answers /api/traces in its own trace JSON with a process table separate from the spans, so a reader for it is a second trace decoder rather than a URL for the existing one';

const FIXTURE_SNAPSHOT = {
  rule: 'fixture',
  backends: [
    { id: 'prometheus', status: 'implemented', summary: PULLED },
    { id: 'jaeger', status: 'unsupported', reason: REASON },
  ],
};

function matrixDoc(...rows: string[]): string {
  return (
    '# Architecture\n\n## 10. T2 backends: what can be pulled from, and what cannot\n\n' +
    'Some prose about the measurement.\n\n' +
    '| backend | status | description |\n| --- | --- | --- |\n' +
    rows.join('\n') +
    '\n\n## 11. Non-goals\n\n- nothing here.\n'
  );
}

const GOOD_ROWS = [
  `| \`prometheus\` | implemented | ${PULLED} |`,
  `| \`jaeger\` | unsupported | ${REASON} |`,
];

/** Run the gate against fixture documents and a fixture snapshot. */
function runCheck(doc: string, snapshot: unknown = FIXTURE_SNAPSHOT) {
  const dir = scratch();
  const docPath = join(dir, 'architecture.md');
  const snapshotPath = join(dir, 'backend-support.json');
  writeFileSync(docPath, doc);
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  const r = spawnSync('node', [CHECK, '--doc', docPath, '--snapshot', snapshotPath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('check-backend-support', () => {
  it('accepts a matrix that agrees with the snapshot', () => {
    const r = runCheck(matrixDoc(...GOOD_ROWS));
    expect(r.code).toBe(0);
    expect(r.out).toContain('check-backend-support: OK');
  });

  // Non-vacuity: the shipped document must be the thing this guard is about.
  it('passes against the shipped document, so the negatives are not the only reachable state', () => {
    const r = spawnSync('node', [CHECK], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout}${r.stderr}`;
    expect(out).toContain('check-backend-support: OK');
    expect(out).toMatch(/(\d+) backend\(s\) in the matrix/);
    expect(Number(out.match(/(\d+) backend\(s\) in the matrix/)![1])).toBeGreaterThanOrEqual(6);
  });

  it('refuses a document with no such table, rather than passing on nothing to read', () => {
    const r = runCheck('# Architecture\n\n## 1. Positioning\n\nnothing here.\n');
    expect(r.code).toBe(1);
    expect(r.out).toContain("no 'T2 backends' table found");
  });

  it('refuses a missing row, because a deleted measurement is not an omission', () => {
    const r = runCheck(matrixDoc(GOOD_ROWS[0]!));
    expect(r.code).toBe(1);
    expect(r.out).toContain('has no row for it');
  });

  it('refuses a status that disagrees with the snapshot, in the direction that hides work', () => {
    const r = runCheck(
      matrixDoc(`| \`prometheus\` | implemented | ${PULLED} |`, `| \`jaeger\` | implemented | ${REASON} |`),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain("is 'unsupported' in the snapshot and 'implemented' in the document");
  });

  it('refuses a description that has drifted from the measured one', () => {
    const r = runCheck(
      matrixDoc(`| \`prometheus\` | implemented | a URL you can point at |`, GOOD_ROWS[1]!),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('has drifted');
  });

  it('refuses a row for a backend the registry does not list', () => {
    const r = runCheck(matrixDoc(...GOOD_ROWS, '| `tempo` | implemented | we can pull traces |'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('a claim about nothing');
  });

  it('refuses two rows for one backend, because which one is read is then arbitrary', () => {
    const r = runCheck(matrixDoc(...GOOD_ROWS, GOOD_ROWS[0]!));
    expect(r.code).toBe(1);
    expect(r.out).toContain('more than one row');
  });

  // A third status would be a way to say nothing: neither "we can pull from this"
  // nor "here is what it would take", which is the pair the requirement asks for.
  it('refuses a status outside the closed pair', () => {
    const r = runCheck(matrixDoc(`| \`prometheus\` | partial | ${PULLED} |`, GOOD_ROWS[1]!));
    expect(r.code).toBe(1);
    expect(r.out).toContain('is not one of implemented / unsupported');
  });

  it('refuses an empty snapshot, so every row cannot be unrefutable', () => {
    const r = runCheck(matrixDoc(...GOOD_ROWS), { rule: 'fixture', backends: [] });
    expect(r.code).toBe(1);
    expect(r.out).toContain('lists no backends');
  });

  // The derive script's own failure branch, which is the whole reason `--check`
  // exists: a script that rewrites its subject on every run reports success
  // whatever the subject said.
  it('reports a stale snapshot rather than rewriting it', () => {
    const dir = scratch();
    const stale = join(dir, 'backend-support.json');
    copyFileSync(SNAPSHOT, stale);
    writeFileSync(stale, JSON.stringify({ rule: 'fixture', backends: [{ id: 'prometheus', status: 'unsupported', reason: REASON }] }, null, 2));

    const r = spawnSync('node', [DERIVE, '--check', '--snapshot', stale], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain('is stale');
    // And it did not repair the file it was asked to check.
    expect(readFileSync(stale, 'utf8')).not.toContain('"implemented"');
  });

  it('accepts the committed snapshot, so the stale case is not the only reachable one', () => {
    const r = spawnSync('node', [DERIVE, '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain('snapshot current');
  });

  it('declares both scripts it spawns, because gate-sites rule 7 reconciles them', () => {
    expect(DRIVES).toEqual(['scripts/check-backend-support.mjs', 'scripts/derive-backend-support.mjs']);
  });
});
