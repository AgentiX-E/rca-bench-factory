import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCEPTANCE,
  BEGIN,
  END,
  acceptanceErrors,
  acceptancePath,
  clauseErrors,
  clausesOf,
  indexErrors,
  indexTable,
  readSections,
  withIndex,
} from '../../../scripts/acceptance-shape.mjs';

/**
 * The shape of `docs/acceptance.md`, and the index that lets one clause be found.
 *
 * `O-019` has argued since v3.62 that this file grows by a clause per round; v3.133 measured it
 * and found the entry's axis wrong -- 35 of 37 clauses hold both a rule and the way it was
 * reached, and a bullet carrying a finding number is a rule with its case, not a recollection.
 * What the file owes instead is what these cases assert: an address a reader can open, a round
 * in the heading, and an index that holds every clause in the order the file states them.
 *
 * Every case below is a fixture except the three that run the real gate, because a rule that is
 * only ever seen passing is the shape finding 121 was written about.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GATE = join(ROOT, 'scripts', 'check-acceptance-shape.mjs');

/**
 * The gate this file drives, declared as well as spawned.
 *
 * `gate-sites-are-proven` compares the sites a test reaches with what the test says it reaches,
 * and a spawn nobody declared is the two accounts disagreeing: the site table would claim a proof
 * the test does not admit to. Named here rather than derived, because a `spawnSync` of a path
 * built at run time cannot be read by a scanner that does not run the test.
 */
export const DRIVES = ['scripts/check-acceptance-shape.mjs'];

/** A document with a lead, one clause, and no index -- the state `--write` exists to repair. */
function documentOf(sections: string[]): string {
  return ['# Acceptance', '', 'Lead paragraph.', '', ...sections, ''].join('\n');
}

/** One clause, with the parts a case will vary. */
function clause(title: string, body: string[]): string[] {
  return [`### ${title}`, '', ...body.map((line) => `- ${line}`), ''];
}

/** A body naming each of the four addresses, so a case can drop one and watch the rule fire. */
const ADDRESSED = [
  '**A rule** (finding 622), and the same command took 70 s in `publish.test.ts`.',
];

describe('what a clause owes a reader', () => {
  it('accepts a clause that names a finding, a round, and nothing else', () => {
    const text = documentOf([...clause('A rule (v3.62)', ADDRESSED), ...clause('Another (v3.63)', ['**Second** (finding 1).'])]);
    expect(clauseErrors(text)).toEqual([]);
  });

  it('refuses a clause whose heading names no round, and quotes the heading as the file spells it', () => {
    const text = documentOf([...clause('A rule with no date', ['**A rule** (finding 622).'])]);
    const errors = clauseErrors(text).join('\n');
    expect(errors).toContain('`A rule with no date` names no round');
    expect(errors).toContain('add `(vX.YY)`');
  });

  it('refuses a clause that names no address, because a judgement with no case is a preference', () => {
    const text = documentOf([...clause('A rule (v3.62)', ['**A rule.** Nothing else here.'])]);
    const errors = clauseErrors(text).join('\n');
    expect(errors).toContain('names no address a reader can open');
    expect(errors).toContain('a judgement with no case is a preference');
  });

  it('counts each of the four addresses on its own, so none of them is decoration', () => {
    const addresses = [
      '**A** (finding 7).',
      '**B**: 4 mutations, 9 reds.',
      '**C**: run `45116975788`.',
      '**D**: `check-open-list.test.ts`.',
    ];
    for (const body of addresses) {
      expect(clauseErrors(documentOf([...clause('A rule (v3.1)', [body])])), body).toEqual([]);
    }
  });

  it('exempts an audit checklist, which carries a pass number where the log carries a round', () => {
    // `2.39` and `2.40` are lists of checks this file asks of an audit, not clauses of the log.
    const text = documentOf([...clause('2.39 CLI argument contract (audit pass 5)', ['- [ ] A check.'])]);
    expect(clauseErrors(text)).toEqual([]);
    expect(clausesOf(text)).toEqual([]);
  });

  it('strips the round from the title and keeps the first one as the column value', () => {
    const text = documentOf([
      ...clause("A record's spelling (v3.63, widened at v3.115 and v3.116)", ['**A** (finding 1).']),
    ]);
    const [only] = clausesOf(text);
    expect(only?.title).toBe("A record's spelling");
    expect(only?.round).toBe('v3.63');
  });

  it('ends a section at the next ## heading, so a layer never belongs to the clause above it', () => {
    const text = ['### A clause (v3.1)', '', '- **A** (finding 1).', '', '## L0 — Core', '', 'Layer prose.', ''].join('\n');
    const [only] = readSections(text);
    expect(only?.body.join('\n')).not.toContain('Layer prose');
    expect(readSections(text)).toHaveLength(1);
  });
});

describe('the index', () => {
  const ONE = documentOf([...clause('A rule (v3.62)', ADDRESSED)]);

  it('refuses a document with no index, and says the command that writes one', () => {
    const errors = indexErrors(ONE).join('\n');
    expect(errors).toContain('has no index between');
    expect(errors).toContain('--write');
  });

  it('accepts the table it writes, which is the whole contract of a projection', () => {
    const written = withIndex(ONE);
    expect(indexErrors(written)).toEqual([]);
    expect(written).toContain('| A rule | v3.62 |');
  });

  it('is idempotent, because a writer that appended on every run would grow the file it repairs', () => {
    const once = withIndex(ONE);
    expect(withIndex(once)).toBe(once);
  });

  it('names a row the file dropped rather than the first difference it happens to meet', () => {
    const two = documentOf([
      ...clause('First (v3.1)', ['**A** (finding 1).']),
      ...clause('Second (v3.2)', ['**B** (finding 2).']),
    ]);
    const written = withIndex(two);
    const withoutSecond = written.replace('| Second | v3.2 |\n', '');
    expect(indexErrors(withoutSecond).join('\n')).toContain('the index is missing the row `| Second | v3.2 |`');
  });

  it('names a row the file does not have, which is the other direction of the same drift', () => {
    const written = withIndex(documentOf([...clause('First (v3.1)', ['**A** (finding 1).'])]));
    const extra = written.replace(`| First | v3.1 |`, `| First | v3.1 |\n| Gone | v3.0 |`);
    expect(indexErrors(extra).join('\n')).toContain('the index has a row the file does not have');
  });

  it('quotes both sentences when one cell moved, which a set comparison could not do', () => {
    const written = withIndex(documentOf([...clause('First (v3.1)', ['**A** (finding 1).'])]));
    const moved = written.replace('| First | v3.1 |', '| First | v3.2 |');
    const errors = indexErrors(moved).join('\n');
    expect(errors).toContain('the index says `| First | v3.2 |`');
    expect(errors).toContain('where the file says `| First | v3.1 |`');
  });

  it('stops after three differences and says so, rather than printing thirty-seven', () => {
    const many = documentOf(
      Array.from({ length: 5 }, (_unused, index) => clause(`Clause ${String(index)} (v3.1)`, ['**A** (finding 1).'])).flat(),
    );
    const written = withIndex(many);
    const broken = written.replace(/\| Clause \d \| v3\.1 \|/g, '| Wrong | v3.9 |');
    const errors = indexErrors(broken);
    expect(errors).toHaveLength(4);
    expect(errors[3]).toContain('further differences are not printed');
  });

  it('inserts the table before the first layer when the document has no markers', () => {
    const text = '# Acceptance\n\nLead.\n\n## L0 — Core\n\nLayer.\n';
    const written = withIndex(text);
    expect(written.indexOf(BEGIN)).toBeLessThan(written.indexOf('## L0'));
    expect(written).toContain('## What this file requires');
  });

  it('appends the table when the document has neither markers nor a layer to stand in front of', () => {
    const written = withIndex('# Only a title\n');
    expect(written.endsWith(`${END}\n`)).toBe(true);
    expect(indexTable('# Only a title\n')).toContain('| Section | Round |');
  });
});

describe('the gate over the shipped file', () => {
  it('passes, and states how many clauses it read and the span of their rounds', () => {
    const run = spawnSync(process.execPath, [GATE], { encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('check-acceptance-shape: OK');
    expect(run.stdout).toMatch(/\d+ clause\(s\) across \d+ round\(s\), v3\.\d+ to v3\.\d+/);
    expect(run.stdout).not.toContain('v3.116 to v3.79');
  });

  it('reads the shipped file with no problem at all, which is the state a push may leave it in', () => {
    expect(acceptanceErrors(readFileSync(ACCEPTANCE, 'utf8'))).toEqual([]);
  });

  it('writes the index into a draft and then accepts it, which is the loop an author runs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'acceptance-shape-'));
    const draft = join(directory, 'acceptance.md');
    writeFileSync(draft, documentOf([...clause('A rule (v3.62)', ADDRESSED)]));
    const written = spawnSync(process.execPath, [GATE, '--write'], {
      encoding: 'utf8',
      env: { ...process.env, RCA_ACCEPTANCE: draft },
    });
    expect(written.status).toBe(0);
    expect(written.stdout).toContain('wrote 1 row(s)');
    const checked = spawnSync(process.execPath, [GATE, '--check'], {
      encoding: 'utf8',
      env: { ...process.env, RCA_ACCEPTANCE: draft },
    });
    expect(checked.status).toBe(0);
    expect(readFileSync(draft, 'utf8')).toContain(BEGIN);
  });

  it('refuses a flag that is neither --write nor --check, rather than quietly checking', () => {
    const run = spawnSync(process.execPath, [GATE, '--repair'], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('is not a flag');
  });

  it('refuses a draft whose clause has no address, and prints one line per problem', () => {
    const directory = mkdtempSync(join(tmpdir(), 'acceptance-shape-'));
    const draft = join(directory, 'acceptance.md');
    writeFileSync(draft, withIndex(documentOf([...clause('A rule (v3.62)', ['**A rule.** No case.'])])));
    const run = spawnSync(process.execPath, [GATE], { encoding: 'utf8', env: { ...process.env, RCA_ACCEPTANCE: draft } });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('check-acceptance-shape: FAILED — 1 problem(s)');
    expect(run.stderr).toContain('`A rule (v3.62)` names no address');
  });

  it('falls back to the shipped file when the override is empty, which is what an unset env is', () => {
    const previous = process.env['RCA_ACCEPTANCE'];
    process.env['RCA_ACCEPTANCE'] = '';
    expect(acceptancePath()).toBe(ACCEPTANCE);
    if (previous === undefined) delete process.env['RCA_ACCEPTANCE'];
    else process.env['RCA_ACCEPTANCE'] = previous;
  });
});
