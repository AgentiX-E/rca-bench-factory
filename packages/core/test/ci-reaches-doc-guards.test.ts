import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every script in `docs:check` must actually run in the pipeline.
 *
 * This file exists because one did not. v1.52 added `scripts/check-l4-status.mjs`
 * to `docs:check` and verified it green on every local run -- and the CI job
 * never invoked it, because the job named the doc guards one at a time instead
 * of calling the aggregate. The observed result was a guard that was correct,
 * tested, enforced locally, and **absent from the one place where a merge is
 * decided**. That is this project's recurring mistake once more, at the level of
 * the pipeline itself: a check whose presence makes the check look covered.
 *
 * ## Why this is a test and not a comment
 *
 * The fix is one line in `ci.yml` -- call `pnpm docs:check` rather than the
 * guards individually. But a one-line fix has the lifetime of the next edit: the
 * next guard added to `docs:check` would again be wired in by remembering, and
 * forgetting is silent. So the rule is asserted here, and the assertion reads
 * *both* sides -- the script list out of `package.json` and the workflow body
 * out of `.github/workflows/ci.yml`. Adding a script to `docs:check` without
 * routing it into the pipeline turns this file red.
 *
 * ## What this does not establish
 *
 * It does not establish that CI *passed* -- only the pipeline can say that, and
 * it does so by running. It establishes the weaker and prior fact that the
 * pipeline is *asked* to run each guard. A gate wired in and failing is a
 * different problem with a different symptom: a red build.
 *
 * It does not establish that every guard in `scripts/` is in `docs:check`.
 * There is no such rule, and inventing one would be wrong: several scripts are
 * probes, generators or one-off tools rather than gates. What is asserted is the
 * subset relation in the one direction that can silently lose a check --
 * everything in the aggregate reaches the pipeline.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const WORKFLOW = 'ci.yml';
const PKG = 'package.json';

function read(relative: string): string {
  return readFileSync(resolve(ROOT, relative), 'utf8');
}

/**
 * The `node scripts/*.mjs` invocations named by a shell command string.
 *
 * Deliberately textual rather than a shell parse: the aggregate is a plain
 * `&&` chain of `node <path>` calls, and reading it as text means the assertion
 * keeps working if the chain is reordered or reformatted, while still failing
 * when an invocation is removed.
 */
function scriptsIn(command: string): string[] {
  const found = command.matchAll(/node\s+(scripts\/[A-Za-z0-9._-]+\.mjs)/g);
  return [...found].map((m) => m[1]!).sort();
}

/**
 * Whether the workflow *executes* `pnpm docs:check`, as opposed to mentioning it.
 *
 * A bare `workflow.includes('pnpm docs:check')` is satisfied by the comment
 * above the step, and measured, that is not hypothetical: deleting the step
 * outright left this file green, because the prose explaining the step still
 * contained the string. An assertion a comment can satisfy is an assertion about
 * prose, so the match is anchored to a `run:` line -- the only place a command
 * is actually executed.
 */
function runsAggregate(workflow: string): boolean {
  return /^\s*run:\s*pnpm docs:check\s*$/m.test(workflow);
}

describe('ci · every aggregate doc guard reaches the pipeline', () => {
  const pkg = JSON.parse(read(PKG)) as { scripts: Record<string, string> };
  const docsCheck = pkg.scripts['docs:check'];
  const workflow = read(`.github/workflows/${WORKFLOW}`);

  it('has a docs:check aggregate, and it invokes at least one guard', () => {
    expect(docsCheck, 'docs:check must exist; the rest of this file is about it').toBeTruthy();
    expect(scriptsIn(docsCheck!).length).toBeGreaterThan(0);
  });

  it('calls the aggregate rather than re-listing its guards, so the next one is wired in by construction', () => {
    // The load-bearing assertion. If the job ever goes back to naming guards one
    // at a time, this fails immediately rather than after the next guard is
    // added and silently skipped.
    expect(
      runsAggregate(workflow),
      `${WORKFLOW} must run \`pnpm docs:check\`; naming the guards individually makes the ` +
        'aggregate a local-only channel, and a guard added to it then runs everywhere except CI',
    ).toBe(true);
  });

  it('routes every guard in the aggregate through that one call, and none by name', () => {
    // The per-guard loop below asks whether each guard *can* reach CI. On its
    // own that question is answered by a single surviving route, so deleting the
    // aggregate call would still leave the guards named individually in the
    // workflow "reachable" -- measured, that break survived. This test closes it
    // from the other side: the aggregate is invoked, and the workflow names no
    // *doc guard* itself.
    //
    // Scoped to the aggregate's own membership rather than to all of
    // `scripts/`. The first version asserted that the workflow names no
    // `scripts/*.mjs` at all, and the baseline was red: the job legitimately
    // calls the mutation injectors and the example-pack verifier by name, and
    // those are not in `docs:check`. An assertion that fails at baseline is not
    // a stricter assertion, it is a wrong one.
    const aggregate = scriptsIn(docsCheck!);
    const byName = scriptsIn(workflow).filter((s) => aggregate.includes(s));
    expect(runsAggregate(workflow)).toBe(true);
    expect(byName, 'the workflow names these aggregate guards itself, so the list can drift').toEqual(
      [],
    );
  });

  it('does not also enumerate the same guards by hand, which is how the drift started', () => {
    const aggregate = scriptsIn(docsCheck!);
    const directly = scriptsIn(workflow);
    const duplicated = aggregate.filter((s) => directly.includes(s));
    expect(
      duplicated,
      'these guards are invoked both through docs:check and by name in the workflow; the ' +
        'duplicate list is what silently stops tracking the aggregate',
    ).toEqual([]);
  });

  it('reaches each guard through the aggregate, never by a hand-maintained list', () => {
    // The route is asserted, not merely the reachability.
    //
    // The version before this one asked, per guard, "is it reachable through the
    // aggregate *or* named directly?" and two deliberate breaks survived it.
    // Deleting the `pnpm docs:check` call literally is the interesting one: with
    // the aggregate gone and the guards still named by hand, every guard was
    // "reachable", so a disjunction over two routes said yes while the pipeline
    // had in fact become the hand-maintained list this iteration removed.
    //
    // A disjunction cannot distinguish "wired in by construction" from "wired in
    // by memory", and only the first one survives the next edit. So there is one
    // accepted route: the aggregate is invoked, and the workflow names no
    // aggregate guard itself. Naming a guard directly is not an alternative path
    // to the same place; it is the failure mode, and the test above forbids it.
    const aggregate = scriptsIn(docsCheck!);
    const byName = scriptsIn(workflow).filter((s) => aggregate.includes(s));
    expect(byName, 'the workflow names these aggregate guards itself, so the list can drift').toEqual(
      [],
    );
    expect(
      runsAggregate(workflow),
      `${WORKFLOW} must run \`pnpm docs:check\`; the aggregate is the route that carries ` +
        'guards added later, and without it a new guard runs everywhere except CI',
    ).toBe(true);
  });

  it('therefore covers every guard in the aggregate, which is what the two assertions compose to', () => {
    // The per-guard claim, derived rather than restated. It is a consequence of
    // the two facts above -- the aggregate is invoked, and nothing in the
    // workflow shadows it -- and stating it here means the composition is
    // visible to a reader instead of being implied.
    const aggregate = scriptsIn(docsCheck!);
    const byName = scriptsIn(workflow).filter((s) => aggregate.includes(s));
    const covered = runsAggregate(workflow) && byName.length === 0;
    for (const script of aggregate) {
      expect(covered, `${script} runs in docs:check but no route carries it to ${WORKFLOW}`).toBe(
        true,
      );
    }
    // And the aggregate is non-empty, so the loop above is a real claim.
    expect(aggregate.length).toBeGreaterThan(0);
  });

  it('names the L4 status guard, which is the one that was missing', () => {
    // Pinned by name so the specific omission this file was written for cannot
    // return through a general mechanism that happens to be satisfied.
    expect(scriptsIn(docsCheck!)).toContain('scripts/check-l4-status.mjs');

    // The inventory guard, pinned by name.
    //
    // The generic rule above proves that everything *in* `docs:check` reaches CI.
    // It says nothing about what is in the aggregate, so deleting a guard from
    // `docs:check` -- which removes it from CI and from the local aggregate in
    // one edit -- passes all seven tests. This assertion is that missing half:
    // the site inventory is checked on every run or the test says so.
    expect(scriptsIn(docsCheck!)).toContain('scripts/derive-gate-sites.mjs');
  });
});
