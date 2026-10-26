import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Where the fourth anchor writes, and what its failure vocabulary says.
 *
 * ## The run this file is about
 *
 * `official-data.yml`, 2026-10-26, scheduled. It downloaded `RE2-OB` -- 1 191 025
 * 569 bytes -- and verified the digest. Then `unzip` stopped with
 * `write error (disk full?)` and the job ended with this sentence in its summary:
 *
 *     **Unreachable** (exit status 1). An asset could not be downloaded. ... and
 *     re-running is a reasonable next step.
 *
 * Every clause of that is wrong. The asset *was* downloaded. The status was not a
 * download failure. And re-running could not possibly help, because the
 * destination was a 7.9 GiB tmpfs and the corpus expands past it -- the run had
 * spent six minutes and 1.2 GB proving it.
 *
 * The physics: `/tmp` belongs to the runner's root disk (about 74 GiB) on the
 * ubuntu-24.04 image, where the 2026-10-12 dispatch of this workflow succeeded,
 * and is a tmpfs on the ubuntu-26.04 image, which `ubuntu-latest` moved to on
 * 2026-10-19. Nothing in this repository measured the assumption, and the
 * workflow's own `df -h /tmp` step printed the number while the fetch step wrote
 * somewhere the sentence describing it no longer matched.
 *
 * ## What this file is, and is not
 *
 * It is a check on the *workflow text*, which is unusual and deliberate -- the
 * same argument `workflow-claims.test.ts` makes. This file is where the reason a
 * path was chosen lives, and the defect here was a path whose reason had expired
 * silently. The rules below are decidable from the text alone: which variable the
 * destination is, whether any executable line still names a path the fetch no
 * longer uses, whether the vocabulary has a case for each exit status the script
 * can produce.
 *
 * It is not a check that the workflow *ran*. That is what the scheduled dispatch
 * is for, and no test in this tree can stand in for it.
 *
 * ## Why each rule is re-run against a corrupted copy
 *
 * A rule that has never rejected anything is a rule nobody can trust -- the
 * project's own recurring finding. So each rule is a pure function over the text,
 * and the last block feeds each one a mutation that should trip it and requires
 * that it does. Without that, "no violations" and "no capability to find one" are
 * the same output.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW_PATH = join(ROOT, '.github', 'workflows', 'official-data.yml');

/**
 * The workflow's lines with YAML comments removed.
 *
 * A comment may name `/tmp` -- the header explains at length why that path is
 * gone, and forbidding the word there would forbid the explanation. An executable
 * line may not. A full-line comment is all this workflow uses; an inline `#`
 * would also have to be stripped here, and none exists.
 */
function executableLines(text: string): { line: string; number: number }[] {
  return text
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => !line.trimStart().startsWith('#'));
}

/**
 * The workflow's commands, with continuation lines joined.
 *
 * `node scripts/fetch-official.mjs \` and its flags are one command spread over
 * three physical lines, and a rule that read a single line would report the flags
 * missing -- a false alarm that would get the rule deleted rather than fixed. The
 * `\` is the workflow's own statement that these lines are one statement.
 */
function commands(text: string): string[] {
  const out: string[] = [];
  let buffer = '';
  for (const { line } of executableLines(text)) {
    const trimmed = line.trimEnd();
    if (trimmed.endsWith('\\')) {
      buffer += `${trimmed.slice(0, -1)} `;
      continue;
    }
    out.push(`${buffer}${line}`.trim());
    buffer = '';
  }
  if (buffer !== '') out.push(buffer.trim());
  return out;
}

/**
 * The destination is the runner's own temp directory, and it is named once.
 *
 * Once means: one shell assignment per directory in the naming step, from
 * `$RUNNER_TEMP`, then exported through `$GITHUB_ENV`. The first version of this
 * change named it at job level with `${{ runner.temp }}`, which GitHub rejects --
 * the `runner` context does not exist there, the file did not parse, and the push
 * run failed in zero seconds. So the rule is about the mechanism as well as the
 * value.
 */
function checkDestination(text: string): string[] {
  const violations: string[] = [];
  for (const [name, tail] of [
    ['OFFICIAL_DIR', 'official'],
    ['REPORTS', 'reports'],
  ]) {
    const assignments = executableLines(text).filter(({ line }) =>
      new RegExp(`^\\s+${name}="\\$RUNNER_TEMP/${tail}"\\s*$`).test(line),
    );
    if (assignments.length !== 1) {
      violations.push(`${name} is assigned as \`$RUNNER_TEMP/${tail}\` in ${assignments.length} places, and the copies will drift`);
    }
    if (!text.includes(`echo "${name}=$${name}"`)) {
      violations.push(`${name} is never exported to $GITHUB_ENV`);
    }
  }
  return violations;
}

/**
 * No expression outside `steps:` uses a context that does not exist there.
 *
 * This is the defect the first version of this change shipped: `runner` is
 * available in steps and not in `jobs.<id>.env`, and the failure is total -- the
 * workflow does not parse, so nothing runs and every other rule in this file
 * still reads a document that looks fine. Only `steps:` and step-level keys may
 * name `runner` or `steps`.
 */
function checkExpressionContexts(text: string): string[] {
  const lines = text.split('\n');
  const stepsAt = lines.findIndex((line) => /^\s+steps:\s*$/.test(line));
  if (stepsAt === -1) return ['the job declares no `steps:`'];
  return lines
    .slice(0, stepsAt)
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => !line.trimStart().startsWith('#') && /\$\{\{\s*(runner|steps)\./.test(line))
    .map(({ line, index }) => `line ${index + 1} uses a runner/steps context above the steps: ${line.trim()}`);
}

/** No executable line names a path outside the variables the job declares. */
function checkNoHardcodedTempPath(text: string): string[] {
  return executableLines(text)
    .filter(({ line }) => line.includes('/tmp'))
    .map(({ line, number }) => `line ${number} names /tmp in executable text: ${line.trim()}`);
}

/** Every path handed to a script is one of the four declared variables. */
function checkPathsAreVariables(text: string): string[] {
  const expected: [string, string[]][] = [
    ['scripts/fetch-official.mjs', ['--out "$OFFICIAL_DIR"', '--report-pins "$PINS"']],
    ['scripts/gen-rcaeval-cases.mjs', ['--official-dir "$OFFICIAL_DIR"', '--out "$CASES"']],
    ['scripts/check-official.mjs', ['--official-dir "$OFFICIAL_DIR"', '--cases "$CASES"', '--report "$SCORES"']],
    ['scripts/apply-pins.mjs', ['--report "$PINS"']],
  ];
  const violations: string[] = [];
  for (const [script, flags] of expected) {
    const command = commands(text).find((candidate) => candidate.includes(`node ${script} `));
    if (command === undefined) {
      violations.push(`${script} is never invoked`);
      continue;
    }
    for (const flag of flags) {
      if (!command.includes(flag)) {
        violations.push(`${script} is not given ${flag}: ${command}`);
      }
    }
  }
  return violations;
}

/**
 * The outcome vocabulary has a case for every status the script can exit with.
 *
 * The five numbers come from `scripts/fetch-official.mjs`'s header, and the two
 * that were missing are exactly the two this file exists for: 3 (does not fit) and
 * 4 (could not unpack). Both used to fall into `*`, whose text asserts a download
 * failure -- so the summary named the wrong cause with confidence.
 */
function checkOutcomeVocabulary(text: string): string[] {
  const violations: string[] = [];
  for (const expected of ['0', '1', '2', '3', '4', '124']) {
    if (!new RegExp(`^\\s+${expected}\\)$`, 'm').test(text)) {
      violations.push(`the fetch step has no case for exit status ${expected}`);
    }
  }
  for (const phrase of ['**Does not fit.**', '**Could not unpack**', '**Pin mismatch.**', '**Timed out**']) {
    if (!text.includes(phrase)) violations.push(`the outcome summary never says ${phrase}`);
  }
  return violations;
}

/**
 * The free-space report is about the destination the fetch uses.
 *
 * This is the rule that would have caught the original defect at review time: the
 * step existed, it printed a real number, and the number was about a directory the
 * fetch had stopped using. A measurement of somewhere else is worse than no
 * measurement, because it looks like coverage.
 */
function checkDiskReport(text: string): string[] {
  const violations: string[] = [];
  const lines = executableLines(text);
  const reports = lines.filter(({ line }) => line.includes('df -h'));
  if (reports.length !== 2) {
    violations.push(`expected a free-space report before and after the fetch; found ${reports.length}`);
  }
  for (const { line, number } of reports) {
    if (!line.includes('"$OFFICIAL_DIR"')) {
      violations.push(`line ${number} reports free space at something other than the destination: ${line.trim()}`);
    }
  }
  const created = lines.findIndex(({ line }) => line.includes('mkdir -p "$OFFICIAL_DIR"'));
  const firstReport = lines.findIndex(({ line }) => line.includes('df -h'));
  if (created === -1 || (firstReport !== -1 && created > firstReport)) {
    violations.push('the destination is not created before it is measured, so `df` would fail or measure its parent');
  }
  return violations;
}

/**
 * The artefact paths are expressions, because `with:` does not expand env vars.
 *
 * A `$PINS` in an upload block is uploaded as the literal string `$PINS`, which
 * `upload-artifact` reports as "no files found" -- a warning, not a failure, so the
 * pins would silently stop being published while the job stayed green.
 */
function checkArtifactPaths(text: string): string[] {
  const block = /^\s+path: (.+)$/m.exec(text);
  if (block === null) return ['the upload step has no `path:` line'];
  const path = block[1].trim();
  const violations: string[] = [];
  if (!path.startsWith('${{ runner.temp }}/')) {
    violations.push(`the artefact path is not a runner.temp expression: ${path}`);
  }
  // The naming step and the upload step spell the report directory twice, because
  // `with:` is evaluated before the runtime export exists. This ties the two
  // spellings: the basename the upload uses has to be the one the naming step
  // declared, so a renamed directory fails here rather than silently uploading
  // nothing (which `if-no-files-found: warn` would report as a warning).
  const declared = /REPORTS="\$RUNNER_TEMP\/([^"]+)"/.exec(text);
  if (declared === null) {
    violations.push('no step declares REPORTS under $RUNNER_TEMP');
  } else if (!path.endsWith(`/${declared[1]}`)) {
    violations.push(`the artefact path '${path}' does not end in the declared report directory '${declared[1]}'`);
  }
  return violations;
}

const RULES: [string, (text: string) => string[]][] = [
  ['the destination', checkDestination],
  ['the expression contexts', checkExpressionContexts],
  ['no hard-coded temp path', checkNoHardcodedTempPath],
  ['the paths handed to the scripts', checkPathsAreVariables],
  ['the outcome vocabulary', checkOutcomeVocabulary],
  ['the free-space report', checkDiskReport],
  ['the artefact paths', checkArtifactPaths],
];

describe('official-data.yml · the destination and the failure vocabulary', () => {
  const text = readFileSync(WORKFLOW_PATH, 'utf8');

  for (const [name, rule] of RULES) {
    it(`holds: ${name}`, () => {
      expect(rule(text)).toEqual([]);
    });
  }

  // The script's header is the authority on the vocabulary, and the workflow's
  // `case` is a second copy of it. This asserts the copy is complete rather than
  // merely plausible -- the two numbers that were missing are the two the
  // scheduled run needed.
  it('agrees with the fetch script on how many outcomes there are', () => {
    const script = readFileSync(join(ROOT, 'scripts', 'fetch-official.mjs'), 'utf8');
    const documented = [...script.matchAll(/^ \* {3}(\d) {2}/gm)].map((match) => match[1]);
    expect(documented).toEqual(['0', '1', '2', '3', '4']);
    for (const code of documented) {
      if (code === '0') continue;
      expect(new RegExp(`^\\s+${code}\\)$`, 'm').test(text)).toBe(true);
    }
  });
});

describe('official-data.yml · the rules can fail', () => {
  const text = readFileSync(WORKFLOW_PATH, 'utf8');

  /**
   * Each mutation is the regression, not a formatting slip: a destination moved
   * back to `/tmp`, a script handed a literal path, a status case deleted, the
   * `df` pointed somewhere else, an artefact path written as a variable.
   */
  const CASES: [string, string, string][] = [
    [
      'the destination moved back to /tmp',
      'OFFICIAL_DIR="$RUNNER_TEMP/official"',
      'OFFICIAL_DIR="/tmp/official"',
    ],
    [
      'a runner expression where the context does not exist',
      '    timeout-minutes: 90',
      '    timeout-minutes: 90\n    env:\n      OFFICIAL_DIR: ${{ runner.temp }}/official',
    ],
    [
      'a script handed a literal path',
      '--anchor "$ANCHOR" --out "$OFFICIAL_DIR"',
      '--anchor "$ANCHOR" --out /scratch/official',
    ],
    [
      'the status-3 case deleted',
      '              3)\n',
      '',
    ],
    [
      'the free-space report pointed at the parent',
      'df -h "$OFFICIAL_DIR"',
      'df -h "${{ runner.temp }}"',
    ],
    [
      'an artefact path written as a variable',
      '          path: ${{ runner.temp }}/reports',
      '          path: $REPORTS',
    ],
    [
      'a report directory the upload does not name',
      'REPORTS="$RUNNER_TEMP/reports"',
      'REPORTS="$RUNNER_TEMP/out"',
    ],
    [
      // The creation moved into the naming step when the job-level `env:` had to go,
      // so the mutation is its absence rather than its order: `df` on a path that
      // does not exist fails, and the free-space report then reports nothing at all.
      'the destination never created',
      '          mkdir -p "$OFFICIAL_DIR" "$REPORTS"\n',
      '',
    ],
  ];

  for (const [name, from, to] of CASES) {
    it(`reports: ${name}`, () => {
      expect(text).toContain(from);
      const mutated = text.replace(from, to);
      expect(mutated).not.toBe(text);
      const caught = RULES.filter(([, rule]) => rule(mutated).length > 0).map(([rule]) => rule);
      expect(caught.length).toBeGreaterThan(0);
    });
  }
});

/**
 * The naming step, executed rather than read.
 *
 * ## Why this block is not checked as text
 *
 * The second dispatch of this workflow failed nine seconds in, at this step, with
 * `##[error]Process completed with exit code 1` and nothing else. The reason was a
 * scope error no text rule can see: the step exported `OFFICIAL_DIR` to
 * `$GITHUB_ENV` and then used `$OFFICIAL_DIR` two lines later, in the same step.
 * A name exported for *later* steps does not exist in *this* one, and `set -u`
 * turns that into an unbound-variable exit.
 *
 * The two rules above are about the document -- one assignment, one export, no
 * `runner` above `steps:`. This one is about behaviour, and it is the only kind of
 * check that could have caught the defect: it runs the block with a temporary
 * `RUNNER_TEMP` and a temporary `GITHUB_ENV`, exactly as the runner would, and
 * asserts the exit status, the exported names, and the two directories.
 *
 * The negative control below is the defect itself: drop the assignment and keep
 * the export, and the block must fail. Without it, "the block exits 0" could be
 * true of a block that does nothing.
 */
describe('official-data.yml · the naming step, executed', () => {
  const text = readFileSync(WORKFLOW_PATH, 'utf8');

  /** The `run:` block of the step named `name`, with the block scalar's indent removed. */
  function runBlockOf(source: string, name: string): string {
    const lines = source.split('\n');
    const at = lines.findIndex((line) => line.trim() === `- name: ${name}`);
    if (at === -1) throw new Error(`no step is named '${name}'`);
    let runAt = -1;
    for (let i = at + 1; i < lines.length; i += 1) {
      if (/^\s+- name: /.test(lines[i])) break;
      if (/^\s+run: \|\s*$/.test(lines[i])) {
        runAt = i;
        break;
      }
    }
    if (runAt === -1) throw new Error(`step '${name}' has no 'run: |' block`);
    const block: string[] = [];
    for (let i = runAt + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.trim() === '') {
        block.push('');
        continue;
      }
      if (line.length - line.trimStart().length < 10) break;
      block.push(line.slice(10));
    }
    return block.join('\n');
  }

  interface Run {
    status: number | null;
    stderr: string;
    exported: string;
  }

  /**
   * Run `block` with `tmp` standing in for `RUNNER_TEMP`, capturing what it exports.
   *
   * The temporary directory is passed in rather than created here, so the caller
   * owns exactly one binding for it -- the one it deletes. A helper that returned
   * the path inside its result object made `rmSync(result.tmp)` look, to this
   * repository's no-writes-inside-the-package scan, like a write whose value came
   * from the repository: the object is built from the workflow text, and the text
   * is read through a repository path. The scan follows bindings by name, so the
   * fix is a binding whose value is `mkdtempSync(join(tmpdir(), ...))` and nothing
   * else.
   */
  function runBlockIn(tmp: string, block: string): Run {
    const envFile = join(tmp, 'github-env');
    writeFileSync(envFile, '');
    const result = spawnSync('bash', ['-c', block], {
      env: { ...process.env, RUNNER_TEMP: tmp, GITHUB_ENV: envFile },
      encoding: 'utf8',
    });
    return { status: result.status, stderr: result.stderr, exported: readFileSync(envFile, 'utf8') };
  }

  it('exports every path, and creates both directories, in one run', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rca-bench-name-'));
    try {
      const run = runBlockIn(tmp, runBlockOf(text, 'Name the destination once'));
      expect(run.status, run.stderr).toBe(0);
      for (const name of ['OFFICIAL_DIR', 'REPORTS', 'PINS', 'CASES', 'SCORES']) {
        expect(run.exported).toMatch(new RegExp(`^${name}=${tmp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'm'));
      }
      // Every report is inside the directory the upload publishes, which is the
      // fact that makes the artefact path valid rather than merely plausible.
      expect(run.exported).toMatch(/^PINS=.*\/reports\/pins\.json$/m);
      expect(run.exported).toMatch(/^CASES=.*\/reports\/rcaeval-cases\.json$/m);
      expect(run.exported).toMatch(/^SCORES=.*\/reports\/rcaeval-scores\.json$/m);
      expect(existsSync(join(tmp, 'official'))).toBe(true);
      expect(existsSync(join(tmp, 'reports'))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('fails a block that uses a name it has only exported', () => {
    // The shipped defect, exactly: the assignment removed, the use retained.
    const broken = runBlockOf(text, 'Name the destination once').replace(
      'OFFICIAL_DIR="$RUNNER_TEMP/official"\n',
      '',
    );
    const tmp = mkdtempSync(join(tmpdir(), 'rca-bench-name-'));
    try {
      const run = runBlockIn(tmp, broken);
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain('OFFICIAL_DIR');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
