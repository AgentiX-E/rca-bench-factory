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

  it('names the fullest volume rather than only its size', () => {
    // Here the fullest volume usually *is* the newest, which is what made the unnamed reading survive:
    // the reader's guess was right often enough to be trusted. The fixture makes the answer the oldest
    // volume, so the test fails for a rule that returns a position rather than a name (finding 294).
    const dir = volumesOf({
      'volume-01.md': `## Pass 1 — one\n\n${'x'.repeat(6_000)}\n`,
      'volume-02.md': '## Pass 2 -- two\n\nbody\n',
    });
    const summary = check(indexFor([['volume-01.md', 1, 'Pass 1', 'Pass 1'], ['volume-02.md', 1, 'Pass 2', 'Pass 2']]), dir).summary;
    expect(summary).toContain('largest volume-01.md at');
    expect(summary).not.toContain('largest volume-02.md');
  });

  it('refuses a volume over the budget, and says how to make room', () => {
    const dir = volumesOf({ 'volume-01.md': `## Pass 1 — one\n\n${'x'.repeat(MAX_BYTES)}\n` });
    const errors = check(indexFor([['volume-01.md', 1, 'Pass 1', 'Pass 1']]), dir).errors.join('\n');
    expect(errors).toContain('is 200');
    expect(errors).toContain('start the next volume');
  });

  it('judges the budget on the volume that can still grow, and only there', () => {
    // volume-01 over the budget and volume-02 under it: nothing appends to volume-01, so the
    // number cannot force the decision it exists for, and refusing a repair there with
    // "start the next volume" would be advice that volume cannot follow (finding 208).
    const closed = volumesOf({
      'volume-01.md': `## Pass 1 — one\n\n${'x'.repeat(MAX_BYTES)}\n`,
      'volume-02.md': '## Pass 2 — two\n',
    });
    const index = indexFor([
      ['volume-01.md', 1, 'Pass 1', 'Pass 1'],
      ['volume-02.md', 1, 'Pass 2', 'Pass 2'],
    ]);
    expect(check(index, closed).errors.join('\n')).not.toContain('start the next volume');

    // The same file as the last volume is refused, because that is the one a round lands in.
    const last = volumesOf({ 'volume-01.md': `## Pass 1 — one\n\n${'x'.repeat(MAX_BYTES)}\n` });
    expect(check(indexFor([['volume-01.md', 1, 'Pass 1', 'Pass 1']]), last).errors.join('\n')).toContain(
      'start the next volume',
    );
  });

  it('prints every volume\'s size, which is what replaces a rule on the closed ones', () => {
    // The cost of judging only the last volume is that a closed one could be grown by an
    // edit unnoticed. The sizes are therefore printed, all of them, on every run -- a
    // volume that doubled shows up in the line a reader of a red build already reads.
    const dir = volumesOf({ 'volume-01.md': '## Pass 1 — one\n', 'volume-02.md': '## Pass 2 — two\n' });
    const result = check(
      indexFor([
        ['volume-01.md', 1, 'Pass 1', 'Pass 1'],
        ['volume-02.md', 1, 'Pass 2', 'Pass 2'],
      ]),
      dir,
    );
    expect(result.summary).toMatch(/sizes [\d,]+ \/ [\d,]+/);
    expect(result.summary.match(/sizes ([\d, /]+?);/)?.[1].split(' / ')).toHaveLength(2);
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

/**
 * The sections a round closes itself with, and which round they belong to.
 *
 * v3.18 was written by inserting it **above** v3.17's `### Readings`, so v3.17 lost its
 * ledger and v3.18 held two. Concatenation still passed: every byte was present, in
 * order, and the split rule ("a boundary between two entries, never inside one") was
 * satisfied -- the defect was *inside* one entry. Finding 309.
 *
 * Two rules, because the defect has two halves: a round holds one of each closing
 * section, and a round after the ledger began holds its own. The first alone would have
 * caught the double; only the second says anything about the round that lost it.
 */
describe('the closing sections a round owns', () => {
  it('refuses a round holding two `### Readings`, and names the round inserted before it', () => {
    const dir = volumesOf({
      'volume-01.md': [
        '## v3.01 — the first round',
        '',
        '### Readings',
        '',
        '> Ledger for `v3.01`.',
        '',
        '| what | this round |',
        '',
        '### Left open',
        '',
        '- nothing `[open: a fixture]`',
        '',
        '## v3.02 — the second round',
        '',
        '### Readings',
        '',
        '> Ledger for `v3.02`.',
        '',
        '| what | this round |',
        '',
        '### Unchanged',
        '',
        '### Readings',
        '',
        '| what | this round |',
        '',
        '### Left open',
        '',
        '- nothing `[open: a fixture]`',
        '',
      ].join('\n'),
    });
    const errors = check(indexFor([['volume-01.md', 2, 'v3.01', 'v3.02']]), dir).errors.join('\n');
    expect(errors).toContain('holds 2 `### Readings` sections');
    expect(errors).toContain('finding 309');
  });

  it('refuses a round with no readings when the round before it has some', () => {
    // The half the duplication rule cannot see: v3.02's own section is in the file, and it
    // is in v3.01, which is why the count on v3.01 looked correct.
    const dir = volumesOf({
      'volume-01.md': [
        '## v3.01 — the first round',
        '',
        '### Readings',
        '',
        '> Ledger for `v3.01`.',
        '',
        '| what | this round |',
        '',
        '## v3.02 — the second round',
        '',
        'body, and no ledger',
        '',
      ].join('\n'),
    });
    const errors = check(indexFor([['volume-01.md', 2, 'v3.01', 'v3.02']]), dir).errors.join('\n');
    expect(errors).toContain('which closes with `### Readings`, and carries none');
    expect(errors).toContain('finding 309');
  });

  it('accepts the rounds before the ledger began, because the chain needs a first link', () => {
    // Pinning the version it started at would be a literal that rots; the volume already
    // says where, so the rule reads it from the document it is checking.
    const dir = volumesOf({
      'volume-01.md': '## Pass 7 — one\n\nbody\n',
      'volume-02.md': '## v2.06 — two\n\nbody\n',
    });
    const result = check(
      indexFor([['volume-01.md', 1, 'Pass 7', 'Pass 7'], ['volume-02.md', 1, 'v2.06', 'v2.06']]),
      dir,
    );
    expect(result.errors).toEqual([]);
  });

  it('counts a quoted `### Readings` as prose, not as a second section', () => {
    // A round may quote a shape it is describing -- v2.26 quotes four headings that are not
    // headings -- and a fenced quotation counted as a section would make the rule refuse
    // the round that documents it.
    const dir = volumesOf({
      'volume-01.md': [
        '## v3.01 — a round that quotes its own grammar',
        '',
        '```markdown',
        '### Readings',
        '### Readings',
        '```',
        '',
        '### Readings',
        '',
        '> Ledger for `v3.01`.',
        '',
        '| what | this round |',
        '',
      ].join('\n'),
    });
    expect(check(indexFor([['volume-01.md', 1, 'v3.01', 'v3.01']]), dir).errors).toEqual([]);
  });
});

/**
 * Which round a ledger belongs to, as the ledger itself states it.
 *
 * The two rules above count sections, and counting cannot see a swap: two rounds whose
 * ledgers were exchanged each hold exactly one, each well formed. Finding 309 recorded
 * that as the half it left open, and closed it with a sentence -- "checking ownership
 * would mean re-deriving each round's numbers from the tree as it stood in that round".
 * That is one way to ask. The cheaper one is to ask the block, because the block knows:
 * it is a table of numbers some round measured, and the round has a name.
 *
 * What the answer buys is that the claim **travels with the block**. An insertion at the
 * wrong heading now carries the wrong name into the round it landed in, which is the
 * accident finding 309 describes. It does not stop a forger who edits the name as well,
 * and the guard is not pretending otherwise -- the subject is the accident.
 */
describe('the round a ledger says it measured', () => {
  it('accepts a ledger that names the round above it', () => {
    const dir = volumesOf({
      'volume-01.md': [
        '## v3.01 — the first round',
        '',
        '### Readings',
        '',
        '> Ledger for `v3.01`.',
        '',
        '| what | this round |',
        '',
      ].join('\n'),
    });
    expect(check(indexFor([['volume-01.md', 1, 'v3.01', 'v3.01']]), dir).errors).toEqual([]);
  });

  it('refuses two ledgers that were exchanged, and names both rounds', () => {
    // The defect the counting rules cannot see, in the smallest form that has it: one
    // line each, swapped, everything else untouched. Both rounds still hold exactly one
    // `### Readings`, both still close themselves once, and the log still concatenates.
    const dir = volumesOf({
      'volume-01.md': [
        '## v3.01 — the first round',
        '',
        '### Readings',
        '',
        '> Ledger for `v3.02`.',
        '',
        '| what | this round |',
        '',
        '## v3.02 — the second round',
        '',
        '### Readings',
        '',
        '> Ledger for `v3.01`.',
        '',
        '| what | this round |',
        '',
      ].join('\n'),
    });
    const errors = check(indexFor([['volume-01.md', 2, 'v3.01', 'v3.02']]), dir).errors.join('\n');
    expect(errors).toContain('says it measured `v3.02`');
    expect(errors).toContain('says it measured `v3.01`');
    expect(errors).toContain('filed under another');
    expect(errors.match(/finding 309/g)).toHaveLength(2);
  });

  it('refuses a ledger whose first line is the table, and quotes what it found', () => {
    // The shape every ledger had before this rule: the table is right there under the
    // heading, which is why position looked like ownership. The refusal quotes the line
    // so the repair is "write this line", not "something is wrong here".
    const dir = volumesOf({
      'volume-01.md': [
        '## v3.01 — the first round',
        '',
        '### Readings',
        '',
        '| what | this round |',
        '',
      ].join('\n'),
    });
    const errors = check(indexFor([['volume-01.md', 1, 'v3.01', 'v3.01']]), dir).errors.join('\n');
    expect(errors).toContain('first line is `| what | this round |`');
    expect(errors).toContain('a position is not an owner');
  });

  it('accepts the ledger line after a blank line, because a markdown table needs the break', () => {
    // The line sits between the heading and the table, so there are two blank lines where
    // there was one. Reading the *first non-blank* line rather than the next line is what
    // lets the shape be markdown.
    const dir = volumesOf({
      'volume-01.md': [
        '## v3.01 — the first round',
        '',
        '### Readings',
        '',
        '',
        '> Ledger for `v3.01`.',
        '',
        '| what | this round |',
        '',
      ].join('\n'),
    });
    expect(check(indexFor([['volume-01.md', 1, 'v3.01', 'v3.01']]), dir).errors).toEqual([]);
  });

  it('refuses a ledger under a round that has no label to give', () => {
    // `## Finding 124` and `## Iteration` are rounds outside both numberings. A ledger
    // needs a name, and inventing one here would make the log claim an order it has not
    // got -- the same reason `labelOf` returns null rather than a number.
    const dir = volumesOf({
      'volume-01.md': [
        '## Iteration — F-41 / F-42 / F-43',
        '',
        '### Readings',
        '',
        '> Ledger for `Iteration`.',
        '',
        '| what | this round |',
        '',
      ].join('\n'),
    });
    const errors = check(indexFor([['volume-01.md', 1, 'Iteration', 'Iteration']]), dir).errors.join('\n');
    expect(errors).toContain('no label a reader could cite');
  });

  it('refuses one ledger measured on two trees', () => {
    // A ledger assembled by copying half of another round's ledger is two measurements
    // under one title, and the numbers that disagree will be read as a change.
    const dir = volumesOf({
      'volume-01.md': [
        '## v3.01 — the first round',
        '',
        '### Readings',
        '',
        '> Ledger for `v3.01`.',
        '',
        '| `core` test suite | **209 files** (as of `7b5d792`) |',
        '| `cli` test suite | **4 files** (as of `2aed8ce`) |',
        '',
      ].join('\n'),
    });
    const errors = check(indexFor([['volume-01.md', 1, 'v3.01', 'v3.01']]), dir).errors.join('\n');
    expect(errors).toContain('measures one ledger against 2 trees');
    expect(errors).toContain('7b5d792, 2aed8ce');
  });

  it('accepts a ledger whose rows all name one tree, and one that names none', () => {
    const one = volumesOf({
      'volume-01.md': [
        '## v3.01 — the first round',
        '',
        '### Readings',
        '',
        '> Ledger for `v3.01`.',
        '',
        '| `core` test suite | **209 files** (as of `7b5d792`) |',
        '| `cli` test suite | **4 files** (as of `7b5d792`) |',
        '',
      ].join('\n'),
    });
    expect(check(indexFor([['volume-01.md', 1, 'v3.01', 'v3.01']]), one).errors).toEqual([]);

    // A ledger of relative statements names no tree, and that is a shape the log uses:
    // rounds before v3.22 wrote movement rather than an absolute count, because a count
    // retyped in a narrative is a row that goes stale in one round.
    const none = volumesOf({
      'volume-01.md': [
        '## v3.01 — the first round',
        '',
        '### Readings',
        '',
        '> Ledger for `v3.01`.',
        '',
        '| suite | **seven more tests than the round before** |',
        '',
      ].join('\n'),
    });
    expect(check(indexFor([['volume-01.md', 1, 'v3.01', 'v3.01']]), none).errors).toEqual([]);
  });
});
