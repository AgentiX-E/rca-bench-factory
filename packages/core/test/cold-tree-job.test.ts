import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The pipeline must contain a job that starts where a reader starts.
 *
 * ## What this file exists for
 *
 * `typecheck` was green for months because CI ran `Build` before `Type-check`,
 * so the step was satisfied by the step above it (finding 43). The fix was a
 * `pretypecheck` hook, and it was a real fix -- `pnpm typecheck` now works on a
 * tree that has never been built, which `typecheck-entrypoint.test.ts` asserts
 * by doing exactly that.
 *
 * But the defect was not "`typecheck` is missing a hook". It was **"the
 * pipeline's step order is a precondition nobody wrote down"**, and fixing the
 * one script that had been observed to break left that structure intact. When
 * P2-1 was finally measured, three of the seven doc guards and the whole of
 * `lint`, `test`, `examples:check` and `official:check` turned out to have the
 * same shape -- a consequence of their order in `ci.yml` rather than of
 * anything they say about themselves.
 *
 * The cold-tree job is what makes that class of defect impossible to keep. It
 * checks out the repository, installs, and then runs the chain with **no build
 * step of its own**: every script it calls has to satisfy its own precondition.
 * A future script that assumes a warm tree fails there on the push that adds
 * it, rather than after the next person happens to work from a fresh clone.
 *
 * ## Why this is a test and not a workflow alone
 *
 * A workflow with no test has no guard: deleting the job, or quietly putting a
 * `pnpm build` back into it, would leave the pipeline green and the coverage
 * gone. Both of those are asserted below. The second is the subtle one -- the
 * job exists to run *without* a build, so a build step inside it does not weaken
 * the job, it removes its reason for existing while looking tidier.
 *
 * ## What this does not establish
 *
 * It does not establish that the job *passes*. Only the pipeline can say that,
 * and it says it by running. A job that is present and red is a different
 * problem with a different symptom, and it is the problem this iteration fixed
 * on the scripts' side rather than a reason to weaken the job.
 *
 * It does not establish that the job's step list equals the main job's step
 * list. The cold-tree job deliberately runs fewer things -- the mutation
 * batteries and the example-pack round trip are about correctness once a tree
 * is built, not about whether a script can find its own inputs -- and inventing
 * an equality rule would force it to duplicate work with no added signal. What
 * is asserted is that it reaches the scripts whose preconditions are in
 * question.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const WORKFLOW = '.github/workflows/ci.yml';

function workflow(): string {
  return readFileSync(resolve(ROOT, WORKFLOW), 'utf8');
}

/**
 * The body of one job, from its `<name>:` line to the next line indented by the
 * same amount or less.
 *
 * Textual rather than a YAML parse on purpose. The repository has no YAML
 * dependency and adding one to read two files would be the tail wagging the dog;
 * more importantly, this reads the same characters CI does, so a job whose `run`
 * lines are nested differently under `steps:` is caught here rather than
 * silently parsed into the wrong shape.
 */
function jobBody(name: string): string {
  const body = workflow();
  const marker = new RegExp(`^ {2}${name}: *$`, 'm');
  const start = body.search(marker);
  if (start === -1) return '';
  const rest = body.slice(start);
  const lines = rest.split('\n');
  const collected: string[] = [lines[0]!];
  for (const line of lines.slice(1)) {
    // A sibling job starts at exactly two spaces; anything else belongs here.
    if (/^ {0,2}\S/.test(line)) break;
    collected.push(line);
  }
  return collected.join('\n');
}

/**
 * Every `run:` payload in a job body, with its block scalars flattened.
 *
 * A step whose command is a `run: |` block contributes all of its lines, so a
 * build hidden inside a multi-line step is still seen -- which is the case the
 * "no build" assertion below has to catch.
 */
function runCommands(body: string): string[] {
  const commands: string[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[i]!);
    if (match === null) continue;
    const indent = match[1]!.length;
    const inline = match[2]!.trim();
    if (inline !== '' && inline !== '|' && inline !== '>') {
      commands.push(inline);
      continue;
    }
    const block: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j]!;
      if (line.trim() === '') continue;
      if (line.search(/\S/) <= indent) break;
      block.push(line.trim());
    }
    commands.push(block.join('\n'));
  }
  return commands;
}

const JOB = 'cold-tree';

/**
 * Every job id in the workflow's `jobs:` map, in file order.
 *
 * A job id is the key directly under `jobs:`, indented two spaces. Read
 * structurally rather than by regex over the whole file, so a comment quoting a
 * job name cannot be mistaken for a job.
 */
function jobIds(): string[] {
  const raw = workflow();
  const lines = raw.split('\n');
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (start === -1) return [];
  const ids: string[] = [];
  for (const line of lines.slice(start + 1)) {
    // The `jobs:` map ends at the first line with no indentation.
    if (/^\S/.test(line)) break;
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m !== null) ids.push(m[1]!);
  }
  return ids;
}

describe('ci · the cold-tree job starts where a reader starts', () => {
  const body = jobBody(JOB);

  it('exists as a job of its own', () => {
    // Named as the job's own key rather than as a step, because a step inside
    // `verify` would inherit the build above it and measure nothing.
    expect(
      body,
      `${WORKFLOW} must define a \`${JOB}:\` job; a step inside an already-warm job cannot ` +
        'observe a precondition, because the steps above it satisfy one',
    ).not.toBe('');
  });

  it('triggers on push and on pull requests, like the job it sits beside', () => {
    // P2-1's exit condition is "the job runs beside the existing CI". A nightly
    // job would still find the defect, but it would find it days later, and this
    // repository's recorded failure mode is precisely a gap that sits unread
    // between the moment it appears and the moment someone looks.
    const head = workflow().split(/^jobs:/m)[0] ?? '';
    expect(head).toMatch(/^\s{2}push:/m);
    expect(head).toMatch(/^\s{2}pull_request:/m);
  });

  it('never builds, because building is the step it exists to remove', () => {
    const commands = runCommands(body);
    const builds = commands.filter((c) => /\bpnpm\s+build\b/.test(c) || /\bpnpm\s+.*\bbuild\b/.test(c));

    expect(
      builds,
      `the ${JOB} job runs a build, which satisfies the very precondition it is measuring:\n` +
        builds.join('\n---\n'),
    ).toEqual([]);
  });

  it('installs, so that the failures it reports are about preconditions and not about absent modules', () => {
    // Without an install step every script fails with MODULE_NOT_FOUND and the
    // job reports a true statement about nothing: it would be red on every push
    // for a reason that is not the one it was added to detect, and its redness
    // would stop carrying information.
    const commands = runCommands(body).join('\n');
    expect(commands).toMatch(/pnpm install/);
  });

  it('reaches the scripts whose preconditions were in question', () => {
    const commands = runCommands(body).join('\n');

    // The scripts that were measured failing on a cold tree. `docs:check` and
    // `lint` are aggregates, so the guards inside them are reached by calling
    // the aggregate -- asserting the individual guard names here would create
    // the second list that `ci-reaches-doc-guards.test.ts` exists to forbid.
    const required = ['pnpm docs:check', 'pnpm lint', 'pnpm test', 'pnpm examples:check'];
    const absent = required.filter((c) => !commands.includes(c));
    expect(absent, `the ${JOB} job does not run: ${absent.join(', ')}`).toEqual([]);
  });

  it('runs the file that proves this rule, so a break fails the job it describes', () => {
    // A guard whose only reader is a local run is the defect this file is
    // about, one level up. The cold-tree job therefore names this test file;
    // if the assertions here are deleted, the job that depends on them stays
    // green and the rule is gone.
    const commands = runCommands(body).join('\n');
    expect(commands).toContain('cold-tree-preconditions.test.ts');
  });
});

/**
 * Every shell the suite cross-checks against must be installed by every job that
 * runs the suite.
 *
 * ## The defect
 *
 * `check-no-unsafe-shell.test.ts` compares the gate's rule against what `zsh` and
 * `bash` do with the same string. It passed here and failed on `ubuntu-24.04`
 * (finding 130) for a reason that had nothing to do with the rule: **`zsh` is not
 * installed on the runner**, and the workflow never installed it.
 *
 * The failure it produced was worse than a missing-dependency error. `spawnSync`
 * sets `status: null` when the binary does not exist, and the original predicate
 * `status !== 0` read that as *the shell rejected the expansion*, so CI reported
 * `zsh rejected ${a}` -- naming the simplest legal expansion in the language as
 * malformed. The fixture now distinguishes an absent shell from a rejecting one,
 * which is why this can be a guard about installation rather than a tolerance for
 * a missing binary.
 *
 * ## Why it is asserted in both directions
 *
 * A workflow step is only a dependency if it is in the job that needs it. The two
 * jobs here run the same suite by different routes -- one builds first, one must
 * not -- so an install in one of them is not an install. Asserting the set of
 * jobs that carry the step, rather than that the step exists, is what makes a
 * third job added later fail this file instead of failing on the runner.
 */
describe('ci · the shells the suite cross-checks against are installed', () => {
  /**
   * The jobs that run any vitest suite, by their **job id**.
   *
   * Job id, not the `name:` display string. `jobBody()` addresses a job by id, and
   * the `name:` value is free text that a comment can quote -- which is how the
   * first version of this test came to match prose. The id is the key in the
   * `jobs:` map and is unique by construction.
   */
  const SUITE_JOB_IDS = ['verify', 'cold-tree'];

  /** The binaries `check-no-unsafe-shell.test.ts` spawns by name. */
  const SHELLS = ['zsh', 'bash'];

  it('every job that runs the suite installs every shell the suite spawns', () => {
    const missing: string[] = [];
    for (const job of SUITE_JOB_IDS) {
      const commands = runCommands(jobBody(job)).join('\n');
      for (const shell of SHELLS) {
        // `bash` ships with the runner, and the fixture asserts availability
        // itself; this guard is about the shells a runner does *not* provide.
        if (shell === 'bash') continue;
        if (!commands.includes(shell)) missing.push(`${job} does not install ${shell}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names every job that runs vitest, so a new one cannot be added without a shell', () => {
    // The list above is a claim about the workflow. Reading the workflow back and
    // requiring every job whose body runs `vitest` to appear in it is what stops
    // the claim from going stale -- the same shape as `scripts-are-classified`,
    // where the register is checked against the directory rather than trusted.
    //
    // The enumeration is structural rather than a regex over the whole file. A
    // first attempt matched `name:` followed by anything up to the next `vitest`,
    // which swept up job comments that mention the word -- the same defect as
    // finding 127's shape rule and finding 129's scanner: a pattern that reads
    // prose as if it were code.
    const jobs = jobIds();
    const withVitest = jobs.filter((id) => jobBody(id).includes('vitest'));
    const registered = withVitest.filter((id) => SUITE_JOB_IDS.includes(id));
    // Every job that runs the suite must be registered, and every registered job
    // must exist -- an equality, not a subset, in both directions.
    expect(
      withVitest.filter((id) => !SUITE_JOB_IDS.includes(id)),
      'these jobs run vitest and are not registered, so their shells are unchecked',
    ).toEqual([]);
    expect(
      SUITE_JOB_IDS.filter((id) => !jobs.includes(id)),
      'these registered jobs no longer exist in the workflow',
    ).toEqual([]);
    expect(registered.length).toBe(SUITE_JOB_IDS.length);
  });
});
