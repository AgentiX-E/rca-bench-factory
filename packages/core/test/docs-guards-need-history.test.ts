import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A guard that resolves a revision needs a checkout that holds one.
 *
 * ## The defect these cases hold
 *
 * `check-repository-table.mjs` refuses a `Commits (at \`<rev>\`)` row whose revision
 * does not resolve, and that refusal is right: the row exists to date a number, and a
 * date nobody can look up is a sentence about nothing. But the row cannot name the
 * commit that writes it -- that commit does not exist yet -- so it names its parent,
 * and the parent is **not in a one-commit checkout**.
 *
 * CI's default checkout is exactly that: `fetch-depth: 1`. So the guard was green on
 * every developer machine, where the clone holds the whole history, and red on the
 * runner from 2026-11-10 to 2026-11-13 -- four rounds, two jobs, the same sentence
 * each time:
 *
 *     ## Repository 'Commits': the revision `d179592` does not resolve to a commit
 *
 * Nothing in this tree compared the guard's requirement with the workflow that runs
 * it, which is why these cases do: the workflow is text, the requirement is a claim
 * about that text, and both can be read without a runner (finding 530).
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW = resolve(ROOT, '.github', 'workflows', 'ci.yml');

/** One job's steps, as text blocks, from a workflow file's own indentation. */
export function stepsOf(jobBody: string): string[] {
  const blocks: string[] = [];
  let current: string[] | null = null;
  for (const line of jobBody.split('\n')) {
    // A step starts at `      - `: six spaces, a dash. Anything shallower ends the
    // job and anything deeper belongs to the step above it.
    if (/^ {6}- /.test(line)) {
      if (current !== null) blocks.push(current.join('\n'));
      current = [line];
      continue;
    }
    if (current !== null) current.push(line);
  }
  if (current !== null) blocks.push(current.join('\n'));
  return blocks;
}

/** The jobs of a workflow, by name, with their bodies. */
export function jobsOf(text: string): { name: string; body: string }[] {
  const jobs: { name: string; body: string }[] = [];
  const header = /(?:^|\n)jobs:\s*\n/.exec(text);
  if (header === null) return jobs;
  let current: { name: string; lines: string[] } | null = null;
  for (const line of text.slice(header.index + header[0].length).split('\n')) {
    const name = /^ {2}([A-Za-z][\w-]*):\s*$/.exec(line);
    if (name !== null) {
      if (current !== null) jobs.push({ name: current.name, body: current.lines.join('\n') });
      current = { name: name[1], lines: [line] };
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  if (current !== null) jobs.push({ name: current.name, body: current.lines.join('\n') });
  return jobs;
}

/** Whether a step runs a docs guard, in either of the two aggregates. */
export function runsDocsGuard(step: string): boolean {
  // Comments are stripped first, and that is not tidiness: the `verify` job carries a
  // comment naming `docs:check` three steps above a command that runs only
  // `measure-doc-counts`, and a rule that read the comment would have demanded full
  // history for a job that resolves nothing. A comment is a sentence about the
  // workflow, not an instruction to it.
  const commands = step
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  return /\bdocs:check(?::cold)?\b/.test(commands);
}

/**
 * The jobs that run a docs guard and check out less than the whole history.
 *
 * Returned rather than thrown so a case can name what it found, and so the real
 * workflow can be reported in one sentence instead of one failure per job.
 */
export function jobsWithShallowHistory(text: string): { job: string; checkout: string }[] {
  const shallow: { job: string; checkout: string }[] = [];
  for (const job of jobsOf(text)) {
    const steps = stepsOf(job.body);
    if (!steps.some(runsDocsGuard)) continue;
    for (const step of steps) {
      if (!step.includes('uses: actions/checkout')) continue;
      // `fetch-depth: 0` is the whole history; anything else, including an absent
      // key, is the default of one commit.
      if (!/^\s*fetch-depth:\s*0\s*$/m.test(step)) shallow.push({ job: job.name, checkout: step });
    }
  }
  return shallow;
}

describe('the workflow that runs a guard needing history', () => {
  it('gives every job that runs a docs guard the whole history', () => {
    const text = readFileSync(WORKFLOW, 'utf8');
    expect(jobsWithShallowHistory(text)).toEqual([]);
    // And the comparison is not vacuous: at least one job does run a docs guard, so
    // a workflow that stopped running them would not pass this case by emptiness.
    const guarded = jobsOf(text).filter((job) => stepsOf(job.body).some(runsDocsGuard));
    // The two jobs this finding is about, by key: `artefacts` runs `pnpm docs:check`
    // and `cold-tree` runs `docs:check:cold`, and both were shallow.
    expect(guarded.map((job) => job.name).sort()).toEqual(['artefacts', 'cold-tree']);
  });

  it('names a job that checks out one commit, rather than passing it', () => {
    // The fixture is the shape CI had: the guard runs, the checkout is the default.
    // A rule that cannot be falsified on a two-job file is a rule about this
    // repository rather than about the property.
    const text = [
      'name: a fixture',
      'jobs:',
      '  documents:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Check out',
      '        uses: actions/checkout@v4',
      '      - name: Documentation guards are satisfied',
      '        run: pnpm docs:check',
      '  elsewhere:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Check out',
      '        uses: actions/checkout@v4',
      '      - name: Test',
      '        run: pnpm test',
      '',
    ].join('\n');
    const shallow = jobsWithShallowHistory(text);
    expect(shallow.map((one) => one.job)).toEqual(['documents']);
    expect(shallow[0].checkout).toContain('actions/checkout@v4');
  });

  it('reads the guard inside a multi-line run block as well as a one-line one', () => {
    // `cold-tree` runs `pnpm --config.enable-pre-post-scripts=false docs:check:cold`,
    // and the job before it runs `pnpm docs:check`. Both are `run:` steps, and a rule
    // that matched only the exact string `docs:check` would have passed this job
    // while its own aggregate contained the guard.
    const text = [
      'jobs:',
      '  cold:',
      '    steps:',
      '      - name: Check out',
      '        uses: actions/checkout@v4',
      '        with:',
      '          fetch-depth: 1',
      '      - name: Documentation guards that read no build artefact',
      '        run: |',
      '          set -eu',
      '          pnpm --config.enable-env=false docs:check:cold',
      '',
    ].join('\n');
    expect(jobsWithShallowHistory(text)).toHaveLength(1);
  });
});

describe('the guard that needs the history', () => {
  it('is a member of both aggregates, which is why the workflow rule is not about one step', () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts['docs:check']).toContain('check-repository-table');
    expect(manifest.scripts['docs:check:cold']).toContain('check-repository-table');
  });

  it('cannot resolve a revision in a one-commit clone, which is the whole mechanism', () => {
    // The premise of the fix, measured rather than argued: a shallow clone holds the
    // tip and nothing behind it, so `rev-parse <parent>` exits non-zero there while
    // the same command in the full clone succeeds. No mock: two real repositories and
    // two real `git` calls.
    const scratch = mkdtempSync(join(tmpdir(), 'shallow-'));
    try {
      const full = join(scratch, 'full');
      const shallow = join(scratch, 'shallow');
      mkdirSync(full, { recursive: true });
      writeFileSync(join(full, 'a.txt'), 'one\n');
      const git = (cwd: string, ...args: string[]): string =>
        execFileSync('git', args, {
          cwd,
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'Lambertyan',
            GIT_AUTHOR_EMAIL: 'lambertyan@users.noreply.github.com',
            GIT_COMMITTER_NAME: 'Lambertyan',
            GIT_COMMITTER_EMAIL: 'lambertyan@users.noreply.github.com',
          },
        });
      git(full, 'init', '--quiet', '-b', 'main');
      git(full, 'add', 'a.txt');
      git(full, 'commit', '--quiet', '-m', 'one');
      const parent = git(full, 'rev-parse', 'HEAD').trim();
      writeFileSync(join(full, 'a.txt'), 'two\n');
      git(full, 'commit', '--quiet', '-am', 'two');
      execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${full}`, shallow], {
        encoding: 'utf8',
      });

      expect(git(full, 'rev-parse', '--verify', '--quiet', `${parent}^{commit}`).trim()).toBe(parent);
      const shallowRead = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${parent}^{commit}`], {
        cwd: shallow,
        encoding: 'utf8',
      });
      expect(shallowRead.status).not.toBe(0);
      // And the tip is there, which is what makes the failure a statement about
      // history rather than about the clone being unusable.
      expect(git(shallow, 'rev-parse', '--verify', '--quiet', 'HEAD^{commit}').trim()).toHaveLength(40);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
