import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  MAX_BYTES,
  check,
  indexCovers,
  labelOf,
  readVolumes,
  straysIn,
} from '../../../scripts/progress-volumes.mjs';

/**
 * The progress log is one index and four volumes, and this is what holds that.
 *
 * The audit log was split by size (finding 195) because a finding is cited by
 * number and a number does not care which volume holds it. **A round is not that**:
 * "the fix did not work" means what it says only because the previous round
 * described the fix. So the split here is by run order, the volumes tile the log,
 * and the rules below are about the two things a sequence can get wrong -- a
 * boundary drawn through a round, and an order that does not advance.
 *
 * Every case is a fixture directory, because a check that can only be run against
 * the real log is a check whose failure modes are all in the future.
 */

/** The gate this file drives, declared as well as spawned. */
export const DRIVES = ['scripts/check-progress-volumes.mjs'];

const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-progress-volumes-'));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-progress-volumes.mjs');

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

/**
 * A directory holding the given volume bodies, keyed by file name.
 *
 * Each body is padded to `FIXTURE_BYTES`, because a volume is tens of kilobytes and a
 * twenty-byte one is not a volume. That mattered the moment the guard gained a relation
 * rather than a constant: `check` now requires the index to be smaller than the smallest
 * volume, and a fixture whose "volume" is one heading would have made every structural
 * test red for a size reason it was not written to exercise. Padding is the honest fix --
 * the alternative, an option that turns the relation off, is a seam that invites exactly
 * the kind of test that measures nothing.
 */
const FIXTURE_BYTES = 4_000;

function volumesOf(files: Record<string, string>): string {
  const dir = mkdtempSync(join(SCRATCH, 'v-'));
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const filler = 'A fixture volume, padded so the size relation has something to compare against.\n';
    const pad = body.length >= FIXTURE_BYTES ? '' : filler.repeat(Math.ceil((FIXTURE_BYTES - body.length) / filler.length));
    writeFileSync(join(dir, name), body + pad);
  }
  return dir;
}

/** An index whose table rows hold the given numbers, in the shape the guard reads. */
function indexFor(rows: [string, number, string, string][]): string {
  return [
    '# Progress tracking',
    '',
    '| file | entries | first | last |',
    '| --- | --- | --- | --- |',
    ...rows.map(([name, count, first, last]) => `| [${name}](progress/${name}) | ${count} | ${first} | ${last} |`),
  ].join('\n');
}

describe('a label a reader can cite', () => {
  it('is the number, in whichever era the round was written', () => {
    expect(labelOf('## Pass 34 -- re-deriving finding 121')).toBe('Pass 34');
    expect(labelOf('## Pass 14 — the provider is configuration')).toBe('Pass 14');
    expect(labelOf('## v2.06 — the corpus nobody wrote')).toBe('v2.06');
  });

  it('keeps the addendum, because it is the one entry allowed to share a version', () => {
    expect(labelOf('## v2.15, addendum — the gate I ran could not fail')).toBe('v2.15, addendum');
  });

  it('is null for the two rounds that belong to neither numbering', () => {
    // `## Finding 124` and `## Iteration — F-41/42/43` sit between `Pass 35` and
    // `Pass 36`. Inventing a label would make the table claim an order the log has
    // not got.
    expect(labelOf('## Finding 124 — the gate inventory')).toBe(null);
    expect(labelOf('## Iteration — F-41 / F-42 / F-43')).toBe(null);
  });
});

describe('the shape of a volume', () => {
  it('accepts contiguous volumes that the index names', () => {
    const dir = volumesOf({
      'volume-01.md': '## Pass 1 — one\n\nbody\n',
      'volume-02.md': '## Pass 2 -- two\n\nbody\n',
    });
    const result = check(indexFor([['volume-01.md', 1, 'Pass 1', 'Pass 1'], ['volume-02.md', 1, 'Pass 2', 'Pass 2']]), dir);
    expect(result.errors).toEqual([]);
    expect(result.summary).toContain('2 volume(s), 2 round(s)');
  });

  it('refuses a volume over the budget, and says how to make room', () => {
    const dir = volumesOf({ 'volume-01.md': `## Pass 1 — one\n\n${'x'.repeat(MAX_BYTES)}\n` });
    const errors = check(indexFor([['volume-01.md', 1, 'Pass 1', 'Pass 1']]), dir).errors.join('\n');
    expect(errors).toContain('is 200');
    expect(errors).toContain('start the next volume');
  });

  it('refuses a volume that begins mid-round, because the boundary went through a sentence', () => {
    const dir = volumesOf({ 'volume-01.md': 'the end of a sentence.\n\n## Pass 2 — two\n' });
    expect(check(indexFor([['volume-01.md', 1, 'Pass 2', 'Pass 2']]), dir).errors.join('\n')).toContain(
      'does not begin at a `## ` heading',
    );
  });

  it('refuses a volume whose name skips a number, because a gap hides a lost file', () => {
    const dir = volumesOf({
      'volume-01.md': '## Pass 1 — one\n',
      'volume-03.md': '## Pass 2 — two\n',
    });
    expect(
      check(indexFor([['volume-01.md', 1, 'Pass 1', 'Pass 1'], ['volume-03.md', 1, 'Pass 2', 'Pass 2']]), dir).errors.join('\n'),
    ).toContain('should be `volume-02.md`');
  });

  it('refuses a directory with no volumes at all', () => {
    const result = readVolumes(join(SCRATCH, 'not-there'));
    expect(result.volumes).toEqual([]);
    expect(result.errors.join('\n')).toContain('no `');
  });

  it('refuses a volume with no round in it', () => {
    const dir = volumesOf({ 'volume-01.md': 'just prose, no heading\n' });
    expect(check('', dir).errors.join('\n')).toContain('holds no round');
  });
});

describe('the order, across two naming eras', () => {
  it('refuses a pass that does not advance, because a round was moved or duplicated', () => {
    const dir = volumesOf({
      'volume-01.md': '## Pass 7 — one\n',
      'volume-02.md': '## Pass 5 — two\n',
    });
    const errors = check(
      indexFor([['volume-01.md', 1, 'Pass 7', 'Pass 7'], ['volume-02.md', 1, 'Pass 5', 'Pass 5']]),
      dir,
    ).errors.join('\n');
    expect(errors).toContain('comes after Pass 7');
  });

  it('refuses a pass filed among the versions, because the eras are in order', () => {
    const dir = volumesOf({ 'volume-01.md': '## v2.06 — one\n\n## Pass 40 -- two\n' });
    expect(check(indexFor([['volume-01.md', 2, 'v2.06', 'Pass 40']]), dir).errors.join('\n')).toContain(
      'the log has two eras',
    );
  });

  it('refuses a version that goes backwards', () => {
    const dir = volumesOf({ 'volume-01.md': '## v2.10 — one\n\n## v2.08 — two\n' });
    expect(check(indexFor([['volume-01.md', 2, 'v2.10', 'v2.08']]), dir).errors.join('\n')).toContain(
      'the log is ordered by version',
    );
  });

  it('refuses two entries claiming one version, unless the second is an addendum', () => {
    const twice = volumesOf({ 'volume-01.md': '## v2.15 — one\n\n## v2.15 — again\n' });
    expect(check(indexFor([['volume-01.md', 2, 'v2.15', 'v2.15']]), twice).errors.join('\n')).toContain(
      'only an `, addendum` entry may share a version',
    );

    const addendum = volumesOf({ 'volume-01.md': '## v2.15 — one\n\n## v2.15, addendum — the gate could not fail\n' });
    expect(check(indexFor([['volume-01.md', 2, 'v2.15', 'v2.15, addendum']]), addendum).errors).toEqual([]);
  });

  it('does not read a quoted heading inside a fence as a round', () => {
    // v2.26 quotes four example headings and v2.27 quotes a verdict block. A count
    // that included them would report rounds the volume does not hold -- the audit
    // guard was wrong about its own example first, and this is the same lesson.
    const dir = volumesOf({
      'volume-01.md': '## v2.06 — one\n\n```\n## Pass 40 -- quoted\n## v2.99 — quoted\n```\n',
    });
    const result = check(indexFor([['volume-01.md', 1, 'v2.06', 'v2.06']]), dir);
    expect(result.errors).toEqual([]);
    expect(result.order).toHaveLength(1);
  });
});

describe('the index that has to reach them', () => {
  it('refuses a volume the index does not name, because that volume is unreachable', () => {
    const errors = indexCovers(indexFor([['volume-01.md', 1, 'Pass 1', 'Pass 1']]), [
      { name: 'volume-01.md', count: 1, first: 'Pass 1', last: 'Pass 1' },
      { name: 'volume-02.md', count: 1, first: 'Pass 2', last: 'Pass 2' },
    ]).join('\n');
    expect(errors).toContain('progress/volume-02.md` 0 time(s)');
  });

  it('refuses a row whose count has drifted, because a reader picks a volume by it', () => {
    const dir = volumesOf({ 'volume-01.md': '## Pass 1 — one\n\n## Pass 2 — two\n' });
    const stale = indexCovers(indexFor([['volume-01.md', 1, 'Pass 1', 'Pass 2']]), readVolumes(dir).volumes).join('\n');
    expect(stale).toContain('holds 1 entries Pass 1–Pass 2; the file holds 2 Pass 1–Pass 2');
  });

  it('refuses a row whose range has drifted, which is the same lie one column over', () => {
    const dir = volumesOf({ 'volume-01.md': '## Pass 1 — one\n\n## Pass 3 — three\n' });
    const stale = indexCovers(indexFor([['volume-01.md', 2, 'Pass 1', 'Pass 2']]), readVolumes(dir).volumes).join('\n');
    expect(stale).toContain('Pass 1–Pass 2; the file holds 2 Pass 1–Pass 3');
  });

  it('refuses an index that names a volume outside a row it can read', () => {
    const bullet = '# Progress\n\n- [volume-01.md](progress/volume-01.md)\n';
    expect(indexCovers(bullet, [{ name: 'volume-01.md', count: 1, first: 'Pass 1', last: 'Pass 1' }]).join('\n')).toContain(
      'not in a row this reader can read',
    );
  });

  it('refuses a round left behind in the index, which is two homes for one round', () => {
    const text = '## Pass log\n\n## Pass 40 -- the round that never moved\n';
    expect(straysIn(text).join('\n')).toContain('still holds `## Pass 40 -- the round that never moved`');
  });

  it('does not read a quoted round in the index as a stray', () => {
    expect(straysIn('## Pass log\n\n```\n## Pass 40 -- quoted\n```\n')).toEqual([]);
  });
});

describe('the command, because a gate nobody has seen fail is not a gate', () => {
  function run(dir: string, index: string) {
    return spawnSync(process.execPath, [SCRIPT], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, RCA_PROGRESS_DIR: dir, RCA_PROGRESS_INDEX: index },
    });
  }

  it('exits zero on a log the index reaches, and says what it counted', () => {
    const dir = volumesOf({
      'volume-01.md': '## Pass 1 — one\n',
      'volume-02.md': '## v2.06 — two\n',
    });
    const index = join(SCRATCH, 'index-ok.md');
    writeFileSync(index, indexFor([['volume-01.md', 1, 'Pass 1', 'Pass 1'], ['volume-02.md', 1, 'v2.06', 'v2.06']]));
    const result = run(dir, index);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('check-progress-volumes: OK');
    expect(result.stdout).toContain('2 round(s)');
  });

  it('exits non-zero on a stale row, and the sentence says which file and which numbers', () => {
    const dir = volumesOf({ 'volume-01.md': '## Pass 1 — one\n' });
    const index = join(SCRATCH, 'index-bad.md');
    writeFileSync(index, indexFor([['volume-01.md', 7, 'Pass 1', 'Pass 1']]));
    const result = run(dir, index);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/progress.md says volume-01.md holds 7 entries');
  });
});

/**
 * The index and the things it indexes.
 *
 * v2.28 wrote that the index had become "the largest single file in `docs/`", and it is
 * the **smallest** of the five progress files -- a claim nobody measured, in a round whose
 * subject was that a measurement must be taken rather than assumed. The rule that replaces
 * it is a relation rather than a number: the file a reader opens first, to find their way
 * to the others, must not be bigger than the things it indexes. Twenty kilobytes of
 * headroom today, six rounds at the current rate, and then the split is an instruction
 * rather than an opinion.
 */
describe('the index has not outgrown what it indexes', () => {
  it('refuses an index bigger than the smallest volume', () => {
    const dir = volumesOf({ 'volume-01.md': `## Pass 1 -- a small volume\n\n${'x'.repeat(400)}\n` });
    // 4_000 padded + the 1_200 below is not enough, so the index is padded past the volume
    // by hand: the point of this case is the comparison, not the constant.
    const index = `${indexFor([['volume-01.md', 1, 'Pass 1', 'Pass 1']])}\n\n${'y'.repeat(6_000)}\n`;
    const errors = check(index, dir).errors.join('\n');
    expect(errors).toContain('has outgrown something it indexes');
    // And it says what to do about it, because "your index is large" is not a repair.
    expect(errors).toContain('belongs');
  });

  it('accepts an index smaller than every volume, and prints the two numbers', () => {
    const dir = volumesOf({ 'volume-01.md': `## Pass 1 -- a larger volume\n\n${'x'.repeat(4000)}\n` });
    const result = check(indexFor([['volume-01.md', 1, 'Pass 1', 'Pass 1']]), dir);
    expect(result.errors).toEqual([]);
    // The relation is printed beside the budget, so a reader can see the headroom rather
    // than take it on trust -- and so a run that shrinks a volume shows up here.
    expect(result.summary).toMatch(/index [\d,]+ of smallest volume [\d,]+/);
  });
});
