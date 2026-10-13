import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach, and reports a disagreement in
 * either direction.
 */
const DRIVES = ['scripts/check-roundtrip-record.mjs'];

/**
 * `scripts/check-roundtrip-record.mjs` -- the guard that holds the recorded round
 * trip, the asset registry and the published figures together.
 *
 * P0-1 closed when run `38250480271` round-tripped 375 of 375 RE1 cases at
 * `oracle=1.00` and verified all three asset digests against the registry. Before
 * this guard, that result lived in one line of a workflow log while the documents
 * described a *different* run -- `docs/progress.md` said in the present tense that
 * "the pass count is still Pass 31's 253 of 375", which had stopped being true.
 *
 * So the tests below are about the three links rather than about today's numbers:
 * the record must name the run it came from, the counts must partition the corpus,
 * the pins must agree with the registry **in both directions**, and the document
 * must publish the same figures. Every expectation is a fixture, so this file does
 * not fail when the round trip is retaken -- it fails when the links break.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-roundtrip-record.mjs');

const dirs: string[] = [];

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const SHA = 'a'.repeat(64);

function record(overrides: Record<string, unknown> = {}) {
  return {
    rule: 'fixture',
    anchor: 'rcaeval-re1',
    run: { id: 1, headSha: 'deadbee', event: 'workflow_dispatch' },
    corpus: { declaredCases: 375, roundTripped: 375, oracle: 1 },
    scores: {
      scored: 375,
      skipped: 0,
      failed: 0,
      oracle: { min: 1, max: 1, mean: 1, distribution: { 1: 375 } },
      source: 'fixture',
    },
    pins: [{ id: 'rcaeval-re1-ob', bytes: 10, sha256: SHA }],
    ...overrides,
  };
}

const REGISTRY = [{ id: 'rcaeval-re1-ob', bytes: 10, sha256: SHA }];

function doc(figures: Record<string, string> = {}): string {
  const rows = {
    anchor: '`rcaeval-re1`',
    'cases declared by the corpus': '**375**',
    'cases round-tripped at `oracle=1.00`': '**375**',
    'cases that did not': '**0**',
    'mean oracle score across the scored cases': '**1.00**',
    'worst per-case oracle score': '**1.00**',
    ...figures,
  };
  return (
    '# Progress tracking\n\n## The last measured round trip\n\n| item | value |\n| --- | --- |\n' +
    Object.entries(rows)
      .map(([k, v]) => `| ${k} | ${v} |`)
      .join('\n') +
    '\n\n## Audit passes\n\n| Pass | Scope |\n| --- | --- |\n'
  );
}

/** Run the guard against fixture files. */
function run(
  options: { record?: unknown; registry?: unknown; doc?: string | null; raw?: { record?: string } } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'roundtrip-'));
  dirs.push(dir);
  const recordPath = join(dir, 'roundtrip.json');
  const registryPath = join(dir, 'official-assets.json');
  const docPath = join(dir, 'progress.md');
  writeFileSync(recordPath, options.raw?.record ?? JSON.stringify(options.record ?? record(), null, 2));
  writeFileSync(registryPath, JSON.stringify(options.registry ?? REGISTRY, null, 2));
  writeFileSync(docPath, options.doc ?? doc());
  const r = spawnSync('node', [SCRIPT, '--record', recordPath, '--registry', registryPath, '--doc', docPath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('check-roundtrip-record', () => {
  it('accepts a record, a registry and a document that agree', () => {
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toContain('check-roundtrip-record: OK');
  });

  // Non-vacuity: the shipped files are what this guard is about.
  it('passes against the shipped record, so the negatives are not the only reachable state', () => {
    const r = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout}${r.stderr}`;
    expect(out).toContain('check-roundtrip-record: OK');
    expect(out).toMatch(/(\d+)\/(\d+) at oracle=/);
    expect(Number(out.match(/(\d+)\/(\d+) at oracle=/)![1])).toBeGreaterThan(0);
  });

  it('refuses a record with no anchor', () => {
    const r = run({ record: record({ anchor: '' }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('names no anchor');
  });

  it('refuses a record with no run id, because its numbers then have no source', () => {
    const r = run({ record: record({ run: { headSha: 'deadbee' } }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('names no run id');
  });

  it('refuses a record with no commit', () => {
    const r = run({ record: record({ run: { id: 1, headSha: 'not a sha' } }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('names no commit');
  });

  it('refuses a corpus of no cases, since a rate over it is undefined', () => {
    const r = run({ record: record({ corpus: { declaredCases: 0, roundTripped: 0, oracle: 1 } }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('declares no cases');
  });

  it('refuses more round-tripped cases than the corpus declares', () => {
    const r = run({ record: record({ corpus: { declaredCases: 10, roundTripped: 11, oracle: 1 } }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('not a');
  });

  it('refuses an oracle outside (0, 1]', () => {
    const r = run({ record: record({ corpus: { declaredCases: 375, roundTripped: 375, oracle: 1.5 } }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('not a score in (0, 1]');
  });

  it('refuses a record with no pins, so it cannot be tied to any download', () => {
    const r = run({ record: record({ pins: [] }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('carries no pins');
  });

  it('refuses a pin that is not a digest', () => {
    const r = run({ record: record({ pins: [{ id: 'rcaeval-re1-ob', bytes: 10, sha256: 'abc' }] }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('not a digest');
  });

  it('refuses a pin for an asset the registry does not list', () => {
    const r = run({ record: record({ pins: [{ id: 'rcaeval-re9-xx', bytes: 10, sha256: SHA }] }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('about nothing');
  });

  // The claim the registry is authoritative for: a record cannot vouch for bytes
  // the registry denies.
  it('refuses a pin whose bytes or digest the registry denies', () => {
    const r = run({ record: record({ pins: [{ id: 'rcaeval-re1-ob', bytes: 11, sha256: SHA }] }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('cannot claim a download the registry denies');
  });

  // And the other direction, which is the one that would let a record drop the
  // asset that failed to verify and still read as complete.
  it('refuses a record that omits an asset the registry has pinned', () => {
    const r = run({
      registry: [
        { id: 'rcaeval-re1-ob', bytes: 10, sha256: SHA },
        { id: 'rcaeval-re1-tt', bytes: 20, sha256: 'b'.repeat(64) },
      ],
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('partial account of the download');
  });

  it('refuses a document with no such section, rather than passing on nothing to read', () => {
    const r = run({ doc: '# Progress tracking\n\n## Audit passes\n\n| Pass |\n| --- |\n' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('no');
    expect(r.out).toContain('section found');
  });

  it('refuses a document that publishes another anchor', () => {
    const r = run({ doc: doc({ anchor: '`rcaeval-re2`' }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('publishes anchor');
  });

  it('refuses a document whose declared case count is another run\'s', () => {
    const r = run({ doc: doc({ 'cases declared by the corpus': '**999**' }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('different run');
  });

  // The exact defect this guard was written for: the documents stood at 253 of 375
  // for two passes after the run reported 375.
  it('refuses the document that stood at 253 of 375', () => {
    const r = run({
      doc: doc({
        'cases round-tripped at `oracle=1.00`': '**253**',
        'cases that did not': '**122**',
      }),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('the document says 253');
  });

  it('refuses a document whose failure count does not complete the partition', () => {
    const r = run({ doc: doc({ 'cases that did not': '**1**' }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('did not round-trip');
  });

  it('reports an unreadable record rather than throwing', () => {
    const r = run({ raw: { record: '{ not json' } });
    expect(r.code).toBe(1);
    expect(r.out).toContain('cannot read the round-trip record');
  });

  // The score block, which is P0-2's deliverable. Before it, the round trip's score
  // existed as `oracle=` on each ROUNDTRIP line and nothing else (finding 155).
  it('refuses a score block that does not say where its numbers came from', () => {
    const r = run({
      record: record({
        scores: { scored: 375, skipped: 0, failed: 0, oracle: { min: 1, max: 1, mean: 1, distribution: { 1: 375 } } },
      }),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('does not say where its numbers came from');
  });

  it('refuses a score block whose records do not cover the declared set', () => {
    const r = run({
      record: record({
        scores: {
          scored: 374,
          skipped: 0,
          failed: 0,
          oracle: { min: 1, max: 1, mean: 1, distribution: { 1: 374 } },
          source: 'fixture',
        },
      }),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('accounts for');
  });

  it('refuses a scored count that disagrees with the round-tripped count', () => {
    const r = run({
      record: record({
        scores: {
          // The partition is valid (374 + 1 + 0 = 375) so the only thing wrong is
          // that `scored` disagrees with the corpus's `roundTripped` -- which is
          // the same fact under two names.
          scored: 374,
          skipped: 1,
          failed: 0,
          oracle: { min: 1, max: 1, mean: 1, distribution: { 1: 374 } },
          source: 'fixture',
        },
        corpus: { declaredCases: 375, roundTripped: 375, oracle: 1 },
      }),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('two');
  });

  it('refuses a distribution that does not account for the scored cases', () => {
    const r = run({
      record: record({
        scores: {
          scored: 375,
          skipped: 0,
          failed: 0,
          oracle: { min: 1, max: 1, mean: 1, distribution: { 1: 374 } },
          source: 'fixture',
        },
      }),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('second, independent count');
  });

  it('refuses a mean outside the range the block reports', () => {
    const r = run({
      record: record({
        scores: {
          scored: 375,
          skipped: 0,
          failed: 0,
          oracle: { min: 1, max: 1, mean: 0.5, distribution: { 1: 375 } },
          source: 'fixture',
        },
      }),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('no set of');
  });

  it('refuses a distribution holding a score outside the reported range', () => {
    const r = run({
      record: record({
        scores: {
          scored: 375,
          skipped: 0,
          failed: 0,
          oracle: { min: 1, max: 1, mean: 1, distribution: { 0.5: 375 } },
          source: 'fixture',
        },
      }),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('outside');
  });

  // The mean written beside a distribution rather than computed from it is a
  // second number that can drift from the first.
  it('refuses a mean that is not the distribution\'s mean', () => {
    const r = run({
      record: record({
        scores: {
          scored: 375,
          skipped: 0,
          failed: 0,
          oracle: { min: 0, max: 1, mean: 0.99, distribution: { 0: 5, 1: 370 } },
          source: 'fixture',
        },
      }),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("distribution's mean");
  });

  // Zero is a score; "no case scored" is not one.
  it('refuses a zero minimum when nothing was scored', () => {
    const r = run({
      record: record({
        corpus: { declaredCases: 1, roundTripped: 0, oracle: 1 },
        scores: { scored: 0, skipped: 0, failed: 1, oracle: { min: 0, max: null, mean: null, distribution: {} }, source: 'fixture' },
        pins: [{ id: 'rcaeval-re1-ob', bytes: 10, sha256: SHA }],
      }),
      doc: doc({ 'cases round-tripped at `oracle=1.00`': '**0**', 'cases that did not': '**1**' }),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('absence of one');
  });

  it('refuses a document whose mean disagrees with the record', () => {
    const r = run({ doc: doc({ 'mean oracle score across the scored cases': '**0.98**' }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('mean oracle');
  });

  it('declares the script it spawns, because gate-sites rule 7 reconciles it', () => {
    expect(DRIVES).toEqual(['scripts/check-roundtrip-record.mjs']);
  });
});
