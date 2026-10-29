import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { MAX_BYTES, absentNumbers, check, indexCovers, readVolumes } from '../../../scripts/audit-volumes.mjs';

/**
 * The audit log is one index and several volumes, and this is what holds that.
 *
 * The split happened because `docs/audit.md` reached 1.1 MB, and while splitting
 * it the log turned out to have **four** heading forms for the same thing
 * (`## 49 —`, `## Finding 65:`, `## Finding 75 --`, `## Finding 140.`). A census
 * that matched one of them reported 127 entries where there were 191 -- which is
 * the failure this repository keeps finding: a count that answers a narrower
 * question than the one it was asked, and says nothing about the difference.
 *
 * So the checks are structural: one heading form, one numbering, one budget, and
 * an index that names every volume. The fixtures below are directories, because a
 * check that can only be run against the real log is a check whose failure modes
 * are all in the future.
 */

/**
 * The gate this file drives, declared as well as spawns.
 *
 * The inventory cross-checks the two accounts: a test that spawns a script must
 * also name it here, so the site's proof cannot rest on a path that drifts.
 *
 * The **reading** is imported from `scripts/audit-volumes.mjs` and the **verdict**
 * is spawned from this gate. They are two files because the meta-gate proves a
 * gate by emptying it: when both halves lived in the gate, every test that read
 * the module died in the same emptied file and the meta-gate reported
 * "exited 1 and named no failing test" -- a proof that proves nothing, which is
 * the one verdict it exists to refuse.
 */
export const DRIVES = ['scripts/check-audit-volumes.mjs'];

const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-audit-volumes-'));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-audit-volumes.mjs');

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

/** A directory holding the given volume bodies, keyed by file name. */
function volumesOf(files: Record<string, string>): string {
  const dir = mkdtempSync(join(SCRATCH, 'v-'));
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

/**
 * An index whose table rows hold the given numbers.
 *
 * The shape is the one the guard reads, because the guard **checks** the row rather
 * than trusting it: a table of contents a reader picks a volume by has to be true.
 */
function indexFor(rows: [string, number, number, number][]): string {
  return [
    '# Audit',
    '',
    '| file | findings | entries | opens with |',
    '| --- | --- | --- | --- |',
    ...rows.map(([name, first, last, count]) => `| [${name}](audit/${name}) | ${first}–${last} | ${count} | x |`),
  ].join('\n');
}

describe('the shape of a volume', () => {
  it('accepts contiguous volumes that the index names', () => {
    const dir = volumesOf({
      'volume-01.md': '## Finding 1 — one\n\nbody\n',
      'volume-02.md': '## Finding 2 — two\n\nbody\n',
    });
    const result = check(indexFor([['volume-01.md', 1, 1, 1], ['volume-02.md', 2, 2, 1]]), dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('2 volume(s), 2 finding(s), 1–2');
  });

  it('names the fullest volume rather than only its size', () => {
    // The reading used to be `largest 279,893 of 280,000 bytes` and nothing else, and the round that
    // appended a finding supplied the subject itself -- naming the volume it had just written in, which
    // held 18,803 bytes. A size without a name is a fact about the set, and the reader who needs it is
    // asking about a file (finding 294).
    //
    // The fixture makes the answer *not* the last volume, which is why the rule is a name rather than a
    // position: in the real log the fullest volume is usually one of the newest, and a reading that is
    // usually right is the one nobody checks.
    const dir = volumesOf({
      'volume-01.md': `## Finding 1 — one\n\n${'x'.repeat(2_000)}\n`,
      'volume-02.md': '## Finding 2 — two\n\nbody\n',
    });
    const summary = check(indexFor([['volume-01.md', 1, 1, 1], ['volume-02.md', 2, 2, 1]]), dir).summary;
    expect(summary).toContain('largest volume-01.md at');
    expect(summary).not.toContain('largest volume-02.md');
  });

  it('refuses a volume that is over the budget, and says how to make room', () => {
    // The budget is what keeps the push that carries one finding small; a volume
    // that drifts past it is how the document became 1.1 MB in the first place.
    const dir = volumesOf({ 'volume-01.md': `## Finding 1 — one\n\n${'x'.repeat(MAX_BYTES)}\n` });
    const errors = check(indexFor([['volume-01.md', 1, 1, 1]]), dir).errors.join('\n');
    expect(errors).toContain('is 280');
    expect(errors).toContain('start `volume-01` as the next volume');
  });

  it('refuses a volume whose name skips a number, because a gap hides a lost file', () => {
    const dir = volumesOf({
      'volume-01.md': '## Finding 1 — one\n',
      'volume-03.md': '## Finding 2 — two\n',
    });
    const errors = check(indexFor([['volume-01.md', 1, 1, 1], ['volume-03.md', 2, 2, 1]]), dir).errors.join('\n');
    expect(errors).toContain('should be `volume-02.md`');
  });

  it('refuses the old heading forms, which are why a census said 127 of 191', () => {
    for (const heading of ['## 49 — numbered', '## Finding 49: colon', '## Finding 49 -- dashes', '## Finding 49. period']) {
      const dir = volumesOf({ 'volume-01.md': `${heading}\n\nbody\n` });
      const errors = check(indexFor([['volume-01.md', 1, 1, 1]]), dir).errors.join('\n');
      expect(errors, heading).toContain('is one of the old heading forms');
    }
  });

  it('does not read a quoted heading inside a fence as a heading', () => {
    // The finding that documents this defect quotes all four old forms in a code
    // block, so the first run of the guard reported four errors against its own
    // example. A fence is a quotation; a heading outside one is a heading.
    const dir = volumesOf({
      'volume-01.md':
        '## Finding 1 — one\n\n```\n## 49 — old\n## Finding 65: old\n```\n\n## Finding 2 — two\n',
    });
    const result = check(indexFor([['volume-01.md', 1, 2, 2]]), dir);
    expect(result.errors).toEqual([]);
    expect(result.numbers).toEqual([1, 2]);
  });

  it('refuses a repeated number, which is two entries claiming one citation', () => {
    const dir = volumesOf({ 'volume-01.md': '## Finding 7 — one\n\n## Finding 7 — again\n' });
    expect(check(indexFor([['volume-01.md', 1, 1, 1]]), dir).errors.join('\n')).toContain('appears twice');
  });

  it('refuses a number that goes backwards, which means two volumes disagree about order', () => {
    const dir = volumesOf({
      'volume-01.md': '## Finding 9 — one\n',
      'volume-02.md': '## Finding 3 — two\n',
    });
    expect(check(indexFor([['volume-01.md', 1, 1, 1], ['volume-02.md', 2, 2, 1]]), dir).errors.join('\n')).toContain('comes after 9');
  });

  it('refuses a directory with no volumes at all', () => {
    const result = readVolumes(join(SCRATCH, 'not-there'));
    expect(result.volumes).toEqual([]);
    expect(result.errors.join('\n')).toContain('no `');
  });

  it('refuses a volume with no finding in it', () => {
    const dir = volumesOf({ 'volume-01.md': '# Audit · volume 01\n\nnothing here\n' });
    expect(check(indexFor([['volume-01.md', 1, 1, 1]]), dir).errors.join('\n')).toContain('holds no findings');
  });
});

describe('the index that has to reach them', () => {
  it('refuses a volume the index does not name, because that volume is unreachable', () => {
    const dir = volumesOf({ 'volume-01.md': '## Finding 1 — one\n', 'volume-02.md': '## Finding 2 — two\n' });
    const errors = indexCovers(indexFor([['volume-01.md', 1, 1, 1]]), [
      { name: 'volume-01.md', first: 1, last: 1, count: 1 },
      { name: 'volume-02.md', first: 2, last: 2, count: 1 },
    ]).join('\n');
    expect(errors).toContain('audit/volume-02.md` 0 time(s)');
    expect(errors).toContain('exactly one row');
  });

  it('refuses a row whose count has drifted, because a reader picks a volume by it', () => {
    const dir = volumesOf({ 'volume-01.md': '## Finding 1 — one\n\n## Finding 2 — two\n' });
    const stale = indexCovers(indexFor([['volume-01.md', 1, 2, 1]]), readVolumes(dir).volumes).join('\n');
    expect(stale).toContain('holds 1–2 (1 entries); the file holds 1–2 (2)');
    expect(stale).toContain('Update the row');
  });

  it('refuses an index that names a volume outside a row it can read', () => {
    // A bullet is a mention, and a mention is not a row: the numbers are the part
    // that makes the table checkable.
    const dir = volumesOf({ 'volume-01.md': '## Finding 1 — one\n' });
    const bullet = '# Audit\n\n- [volume-01.md](audit/volume-01.md)\n';
    expect(indexCovers(bullet, readVolumes(dir).volumes).join('\n')).toContain('not in a row this reader can read');
  });

  it('refuses an index that names a volume twice, because the table is then not a table', () => {
    const twice = `${indexFor([['volume-01.md', 1, 1, 1]])}\n| [again](audit/volume-01.md) | 1–1 | 1 | x |`;
    expect(indexCovers(twice, [{ name: 'volume-01.md', first: 1, last: 1, count: 1 }]).join('\n')).toContain(
      '2 time(s)',
    );
  });
});

describe('the numbers that are not there', () => {
  it('reports a run of absent numbers as one range rather than as a list', () => {
    // The real log has three (118, 132, 133) and no record of why. Printing them
    // is the honest answer; inventing a reason would not be.
    expect(absentNumbers([1, 2, 5, 6, 9])).toBe('3–4, 7–8');
    expect(absentNumbers([118, 132, 133, 134])).toBe('119–131');
    expect(absentNumbers([1, 2, 4])).toBe('3');
    expect(absentNumbers([])).toBe('');
  });
});

describe('the command, because a gate nobody has seen fail is not a gate', () => {
  /** Run the script against a fixture through the same environment the gate uses. */
  function run(dir: string, index: string) {
    return spawnSync(process.execPath, [SCRIPT], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, RCA_AUDIT_DIR: dir, RCA_AUDIT_INDEX: index },
    });
  }

  it('exits zero on a log the index reaches, and says what it counted', () => {
    const dir = volumesOf({ 'volume-01.md': '## Finding 1 — one\n', 'volume-02.md': '## Finding 2 — two\n' });
    const index = join(SCRATCH, 'index-ok.md');
    writeFileSync(index, indexFor([['volume-01.md', 1, 1, 1], ['volume-02.md', 2, 2, 1]]));
    const result = run(dir, index);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('check-audit-volumes: OK');
    expect(result.stdout).toContain('2 finding(s), 1–2');
  });

  it('exits non-zero on a volume the index never names, and the sentence says which', () => {
    const dir = volumesOf({ 'volume-01.md': '## Finding 1 — one\n' });
    const index = join(SCRATCH, 'index-bad.md');
    writeFileSync(index, '# Audit\n\nno rows here\n');
    const result = run(dir, index);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('audit/volume-01.md` 0 time(s)');
  });
});
