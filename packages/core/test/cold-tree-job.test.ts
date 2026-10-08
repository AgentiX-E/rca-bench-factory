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
